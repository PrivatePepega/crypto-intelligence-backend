/**
 * REST client for the GDELT Project DOC 2.0 API.
 *
 * ## Endpoint
 *
 * ```
 * https://api.gdeltproject.org/api/v2/doc/doc
 * ```
 *
 * ## Authentication
 *
 * **None.** Verified empirically against the live endpoint - requests succeed
 * unauthenticated, so this client deliberately sends no credentials. The v1
 * endpoints required a `GDELT_API_KEY`; DOC 2.0 does not.
 *
 * ## Rate limiting
 *
 * GDELT answers over-quota requests with **HTTP 429** and a plain-text body:
 *
 * ```
 * Please limit requests to one every 5 seconds or contact ...
 * ```
 *
 * That message carries **no `Content-Type` header** and is not JSON, so a
 * client that assumes a JSON error envelope will fail confusingly. This client
 * serialises every request through a single queue and enforces a minimum gap
 * between them, because the observed 429s arrived at gaps far wider than the
 * advertised 5 seconds (see `probe01-modes`).
 *
 * ## Timing
 *
 * Measured 8-22 seconds per request during discovery. Callers should treat
 * these as slow, not as a fault.
 */

/** Root of the DOC 2.0 API. Overridable for tests. */
const getBaseUrl = (): string => process.env.GDELT_BASE_URL ?? "https://api.gdeltproject.org";

/** The only path this integration uses. */
const DOC_PATH = "/api/v2/doc/doc";

/** The path this client calls, for logging. Holds no secret. */
export const describeGdeltBaseUrl = (): string => `${getBaseUrl()}${DOC_PATH}`;

/**
 * DOC modes confirmed present in the 2.0 documentation.
 *
 * `artlist` is the only article-returning mode. The `timeline*` modes return
 * time series and differ in what the value column means:
 *
 *  - `timelinevol` - normalized share of all coverage (percent).
 *  - `timelinevolraw` - raw article counts.
 *  - `timelinevolinfo` - volume timeline **plus** an `articles` block per
 *    interval, so it is the only mode that returns both series and articles.
 *  - `timelinetone` - average tone, a characteristic of *reporting style*,
 *    **not** a financial sentiment score.
 *  - `timelinelang` - coverage split by source language.
 *  - `timelinesourcecountry` - coverage split by publisher country.
 */
export const GDELT_MODES = [
  "artlist",
  "timelinevol",
  "timelinevolraw",
  "timelinevolinfo",
  "timelinetone",
  "timelinelang",
  "timelinesourcecountry",
] as const;

export type GdeltMode = (typeof GDELT_MODES)[number];

/** Modes that return articles rather than a time series. */
export const GDELT_ARTICLE_MODES = ["artlist", "timelinevolinfo"] as const;

/**
 * Whether a mode returns articles.
 *
 * Used to decide whether `maxrecords` is applicable. The documentation is
 * clear that article-only parameters must be omitted from timeline requests,
 * and sending them anyway is a known source of silently ignored filters.
 */
export const isArticleMode = (mode: GdeltMode): boolean =>
  (GDELT_ARTICLE_MODES as readonly string[]).includes(mode);

/** Documented cap on `maxrecords` for article-list queries. */
export const GDELT_MAX_RECORDS = 250;

/** Documented sort orders for article queries. */
export const GDELT_SORT_ORDERS = ["HybridRel", "datedesc"] as const;

export type GdeltSort = (typeof GDELT_SORT_ORDERS)[number];

/** Query parameters accepted by the DOC endpoint. */
export type GdeltDocParams = {
  /** Required. Topic/search expression, including any operators. */
  query: string;

  mode: GdeltMode;

  /**
   * Relative window ending now, e.g. `24h`, `7d`, `1w`.
   *
   * **Unverified.** Passed through verbatim; the accepted grammar has not been
   * confirmed against the live endpoint yet. An unparseable value is rejected
   * by GDELT with a non-JSON body, which surfaces as a
   * {@link GdeltApiError}.
   */
  timespan?: string;

  /** Explicit UTC window start, `YYYYMMDDHHMMSS`. Mutually exclusive with timespan. */
  startdatetime?: string;

  /** Explicit UTC window end, `YYYYMMDDHHMMSS`. Mutually exclusive with timespan. */
  enddatetime?: string;

  /** 1-250. Only meaningful for {@link isArticleMode}. */
  maxrecords?: number;

  /** Only meaningful for article modes. */
  sort?: GdeltSort;

  /** Defaults to `json`; never send anything else from this client. */
  format?: "json";
};

/** Thrown for a failed or unusable response, with the upstream body preserved. */
export class GdeltApiError extends Error {
  readonly status: number;

  /**
   * Upstream response body, whitespace-collapsed and truncated.
   *
   * Kept because GDELT's rate-limit and query errors are **plain text**, and
   * that text is the only explanation available.
   */
  readonly body: string;

  constructor(message: string, details: { status: number; body?: string }) {
    super(message);

    this.name = "GdeltApiError";

    this.status = details.status;

    this.body = details.body ?? "";
  }
}

/** Result of one completed DOC request. */
export type GdeltDocResult = {
  /** Parsed JSON body. */
  data: unknown;

  /** Wall-clock milliseconds the request took. */
  elapsedMs: number;

  /** How many attempts it took, including the successful one. */
  attempts: number;

  /** The fully-resolved request URL, for provenance in run logs. */
  url: string;
};

/** Collapses whitespace and truncates, so an error message stays readable. */
const excerpt = (text: string, max = 300): string => text.replace(/\s+/g, " ").trim().slice(0, max);

/** Resolves after `ms`. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Minimum gap between requests, milliseconds.
 *
 * GDELT asks for "one every 5 seconds". Discovery showed 429s at gaps of 15-25
 * seconds, so the default here is set well above the stated minimum and is
 * overridable via `GDELT_MIN_GAP_MS` without a code change.
 */
const minGapMs = (): number => {
  const raw = process.env.GDELT_MIN_GAP_MS;

  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 8_000;
};

/** Per-request timeout. Measured responses reached 22s, so this is generous. */
const requestTimeoutMs = (): number => {
  const raw = process.env.GDELT_TIMEOUT_MS;

  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
};

/**
 * Backoff before each retry, milliseconds.
 *
 * Index 0 is the initial attempt. GDELT returns no `Retry-After` header on a
 * 429, so the schedule is fixed rather than server-directed.
 */
const DEFAULT_RETRY_BACKOFF_MS = [0, 10_000, 25_000] as const;

/**
 * Retry schedule, overridable via `GDELT_RETRY_BACKOFF_MS` (comma-separated
 * milliseconds, first entry being the initial attempt).
 *
 * Overridable so the test suite can exercise the retry path without waiting
 * out the production schedule, and so the schedule can be tuned without a code
 * change if GDELT's behaviour shifts.
 */
const retryBackoffMs = (): number[] => {
  const raw = process.env.GDELT_RETRY_BACKOFF_MS;

  if (raw === undefined || raw.trim() === "") {
    return [...DEFAULT_RETRY_BACKOFF_MS];
  }

  const parsed = raw
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry): entry is number => Number.isFinite(entry) && entry >= 0);

  return parsed.length === 0 ? [...DEFAULT_RETRY_BACKOFF_MS] : parsed;
};

/**
 * Serialises every request behind one queue.
 *
 * Requests run one at a time with a guaranteed gap between the *end* of one and
 * the *start* of the next. Parallel calls would each look like the first
 * request to a limiter counting per-IP, which is exactly what triggers the 429.
 */
let queue: Promise<unknown> = Promise.resolve();

let lastRequestFinishedAt = 0;

const runSerialized = <T>(task: () => Promise<T>): Promise<T> => {
  const result = queue.then(async () => {
    const waitFor = lastRequestFinishedAt + minGapMs() - Date.now();

    if (waitFor > 0) {
      await sleep(waitFor);
    }

    try {
      return await task();
    } finally {
      lastRequestFinishedAt = Date.now();
    }
  });

  // Keep the chain alive after a rejection so one failure cannot wedge the queue.
  queue = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
};

/** Rejects parameter combinations that cannot succeed. */
const validate = (params: GdeltDocParams): void => {
  if (params.query.trim() === "") {
    throw new GdeltApiError("GDELT DOC requires a non-empty query.", {
      status: 0,
    });
  }

  if (!(GDELT_MODES as readonly string[]).includes(params.mode)) {
    throw new GdeltApiError(
      `Unsupported GDELT DOC mode "${params.mode}". Known modes: ${GDELT_MODES.join(", ")}.`,
      { status: 0 },
    );
  }

  if (
    params.maxrecords !== undefined &&
    (params.maxrecords < 1 || params.maxrecords > GDELT_MAX_RECORDS)
  ) {
    throw new GdeltApiError(
      `maxrecords must be 1-${GDELT_MAX_RECORDS}, received ${params.maxrecords}.`,
      { status: 0 },
    );
  }

  // GDELT ignores the combination rather than erroring, which silently widens
  // the window. Refusing is better than returning the wrong range.
  if (params.timespan !== undefined && params.startdatetime !== undefined) {
    throw new GdeltApiError("Provide either timespan or startdatetime/enddatetime, not both.", {
      status: 0,
    });
  }

  const stamp = /^\d{14}$/;

  if (params.startdatetime !== undefined && !stamp.test(params.startdatetime)) {
    throw new GdeltApiError(
      `startdatetime must be YYYYMMDDHHMMSS, received "${params.startdatetime}".`,
      { status: 0 },
    );
  }

  if (params.enddatetime !== undefined && !stamp.test(params.enddatetime)) {
    throw new GdeltApiError(
      `enddatetime must be YYYYMMDDHHMMSS, received "${params.enddatetime}".`,
      { status: 0 },
    );
  }
};

/**
 * Issues one DOC request and returns parsed JSON.
 *
 * Retries **only** on HTTP 429, up to {@link retryBackoffMs}. Every other failure
 * is surfaced immediately: a malformed query will never succeed on a retry, and
 * retrying it would just burn the rate-limit budget.
 *
 * @param params Query parameters. Undefined keys are omitted.
 * @param signal Caller cancellation.
 */
export const requestDoc = async (
  params: GdeltDocParams,
  signal?: AbortSignal,
): Promise<GdeltDocResult> => {
  validate(params);

  return await runSerialized(async () => {
    const url = new URL(`${getBaseUrl()}${DOC_PATH}`);

    url.searchParams.set("query", params.query);
    url.searchParams.set("mode", params.mode);
    url.searchParams.set("format", params.format ?? "json");

    if (params.timespan !== undefined) {
      url.searchParams.set("timespan", params.timespan);
    }

    if (params.startdatetime !== undefined) {
      url.searchParams.set("startdatetime", params.startdatetime);
    }

    if (params.enddatetime !== undefined) {
      url.searchParams.set("enddatetime", params.enddatetime);
    }

    // Article-only parameters are withheld from timeline requests on purpose.
    // See the note on {@link isArticleMode}.
    if (isArticleMode(params.mode) && params.maxrecords !== undefined) {
      url.searchParams.set("maxrecords", String(params.maxrecords));
    }

    if (isArticleMode(params.mode) && params.sort !== undefined) {
      url.searchParams.set("sort", params.sort);
    }

    const startedAt = Date.now();

    const backoffs = retryBackoffMs();

    const maxAttempts = backoffs.length;

    let attempt = 0;
    let lastError: GdeltApiError | null = null;

    while (attempt < maxAttempts) {
      // `attempt` is bounded by `maxAttempts`, so the lookup is always defined;
      // the fallback only satisfies the indexed-access type check.
      const backoff = backoffs[attempt] ?? 0;

      if (backoff > 0) {
        await sleep(backoff);
      }

      const controller = new AbortController();

      const timer = setTimeout(() => controller.abort(), requestTimeoutMs());

      // Honour caller cancellation alongside our own timeout.
      const onAbort = (): void => controller.abort();

      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            // No keep-alive. Observed: requests sharing a pooled connection
            // after a burst failed with `fetch failed` (a socket-level
            // refusal, not an HTTP response), while probes sending
            // `Connection: close` produced only 429s. GDELT advertises
            // `Keep-Alive: max=20` but sheds connections under load, and a
            // reused socket can arrive already dead. Requests are serialised
            // and take 8-26s each, so the saved handshake costs nothing.
            Connection: "close",
          },
          signal: controller.signal,
        });

        const text = await response.text();

        if (response.status === 429) {
          lastError = new GdeltApiError(
            `GDELT DOC rate limited (HTTP 429) on attempt ${attempt + 1}/${maxAttempts}.`,
            { status: 429, body: excerpt(text) },
          );

          attempt += 1;

          continue;
        }

        if (!response.ok) {
          // 400 for a bad query, 200-with-HTML for some other refusals.
          throw new GdeltApiError(`GDELT DOC failed (HTTP ${response.status}): ${excerpt(text)}`, {
            status: response.status,
            body: excerpt(text),
          });
        }

        try {
          return {
            data: JSON.parse(text) as unknown,
            elapsedMs: Date.now() - startedAt,
            attempts: attempt + 1,
            url: url.toString(),
          };
        } catch {
          // A 200 that is not JSON means GDELT served its HTML error page.
          // Returning it as data would let a caller mistake it for coverage.
          throw new GdeltApiError(
            `GDELT DOC returned non-JSON (HTTP ${response.status}): ${excerpt(text)}`,
            { status: response.status, body: excerpt(text) },
          );
        }
      } catch (error) {
        if (error instanceof GdeltApiError) {
          throw error;
        }

        const isAbort = error instanceof Error && error.name === "AbortError";

        throw new GdeltApiError(
          isAbort
            ? `GDELT DOC request timed out after ${requestTimeoutMs()}ms.`
            : `GDELT DOC request failed: ${error instanceof Error ? error.message : String(error)}`,
          { status: 0 },
        );
      } finally {
        clearTimeout(timer);

        signal?.removeEventListener("abort", onAbort);
      }
    }

    throw (
      lastError ??
      new GdeltApiError("GDELT DOC rate limited and retries exhausted.", {
        status: 429,
      })
    );
  });
};
