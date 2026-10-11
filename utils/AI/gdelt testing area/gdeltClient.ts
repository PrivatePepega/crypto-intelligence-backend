/**
 * REST client for the GDELT Project DOC 2.0 API - `artlist` (article search).
 *
 * ## Endpoint
 *
 * ```
 * https://api.gdeltproject.org/api/v2/doc/doc
 * ```
 *
 * ## Authentication
 *
 * None. Confirmed live: requests succeed with no credentials, so none are sent.
 *
 * ## Scope
 *
 * One endpoint, one mode. Every category this project cares about - geopolitics,
 * macro, crypto, AI, energy - is the *same* call with a different `query`
 * expression. Nothing here is category-specific.
 *
 * ## Operators are part of the query, not separate parameters
 *
 * Every GDELT search operator belongs **inside** the `query` string. None of them
 * is a URL parameter, so none of them gets its own field here. Callers build the
 * expression and pass it through; the client neither parses nor rewrites it.
 * That is deliberate - splitting an expression across parameters would give the
 * client opportunities to corrupt operator syntax, and a silently malformed
 * query is indistinguishable from one that legitimately matched nothing.
 *
 * ### Core text search
 *
 * | Operator       | Example                    | Effect                                   |
 * |----------------|----------------------------|------------------------------------------|
 * | Exact phrase   | `"Federal Reserve"`        | Match a phrase                           |
 * | Boolean OR     | `(bitcoin OR ethereum)`    | Match any alternative                    |
 * | Exclusion      | `bitcoin -mining`          | Exclude matching terms                   |
 * | Proximity      | `near10:"tariffs China"`   | Require words to appear close together    |
 * | Repetition     | `repeat3:"inflation"`      | Require a word to appear multiple times  |
 *
 * ### Source filters
 *
 * | Operator          | Example                      | Effect                            |
 * |-------------------|------------------------------|-----------------------------------|
 * | `domain:`         | `domain:reuters.com`         | Domain and its subdomains         |
 * | `domainis:`       | `domainis:reuters.com`       | The exact domain                  |
 * | `sourcecountry:`  | `sourcecountry:unitedstates` | Filter by publisher's country     |
 * | `sourcelang:`     | `sourcelang:spanish`         | Filter by original language       |
 * | `-` before a filter | `-sourcelang:spanish`      | Exclude matching results          |
 *
 * ### Themes and tone
 *
 * | Operator   | Example            | Effect                                    |
 * |------------|--------------------|-------------------------------------------|
 * | `theme:`   | `theme:TERROR`     | Match a GDELT GKG theme                   |
 * | `tone`     | `tone<-5`          | Filter for more negative reporting tone   |
 * | `toneabs`  | `toneabs>10`       | Filter for stronger tone, either direction|
 *
 * `tone` is a property of **how coverage was written**, not bullish/bearish
 * financial sentiment. It must not be presented as a market signal.
 *
 * Proximity and repetition are implemented - they are ordinary text - but they
 * are the two most likely to return nothing, so they are best used for targeted
 * research rather than as broad scan filters.
 *
 * ## No artificial delay
 *
 * There is no request scheduler and no enforced gap between calls. GDELT does
 * rate-limit - HTTP 429 with a **plain-text** body and no `Content-Type` - and
 * that is surfaced to the caller rather than hidden behind a client that
 * silently paces itself.
 */

const getBaseUrl = (): string => process.env.GDELT_BASE_URL ?? "https://api.gdeltproject.org";

const DOC_PATH = "/api/v2/doc/doc";

/** The path this client calls, for logging. Holds no secret. */
export const describeGdeltBaseUrl = (): string => `${getBaseUrl()}${DOC_PATH}`;

/** Fixed for this integration. Only article search is implemented. */
export const GDELT_MODE = "artlist" as const;

/** Fixed by the API; `format=json` is what makes the response parseable. */
export const GDELT_FORMAT = "json" as const;

/** Default recent-news window. */
export const GDELT_DEFAULT_TIMESPAN = "24h";

/** Default result cap. */
export const GDELT_DEFAULT_MAX_RECORDS = 100;

/** Documented ceiling on `maxrecords`. */
export const GDELT_MAX_RECORDS = 250;

/** Default ranking: relevance to the query. */
export const GDELT_DEFAULT_SORT = "HybridRel" as const;

/** Documented sort orders. */
export const GDELT_SORT_ORDERS = ["HybridRel", "datedesc"] as const;

export type GdeltSort = (typeof GDELT_SORT_ORDERS)[number];

/** Search parameters. Only `query` is required. */
export type GdeltSearchParams = {
  /**
   * The search expression, including any operators.
   *
   * A complete string. Callers must not splice free text into the middle of a
   * template - a term inserted between `(` and `OR` changes the parse silently
   * rather than erroring, which is the hardest kind of failure to notice.
   */
  query: string;

  /**
   * Relative window ending now. Defaults to {@link GDELT_DEFAULT_TIMESPAN}.
   *
   * Mutually exclusive with `startdatetime`/`enddatetime`.
   */
  timespan?: string;

  /**
   * Explicit window start, `YYYYMMDDHHMMSS` in UTC.
   *
   * Requires `enddatetime`. Mutually exclusive with `timespan`.
   */
  startdatetime?: string;

  /** Explicit window end, `YYYYMMDDHHMMSS` in UTC. Requires `startdatetime`. */
  enddatetime?: string;

  /** 1-250. Defaults to {@link GDELT_DEFAULT_MAX_RECORDS}. */
  maxrecords?: number;

  /** Defaults to `HybridRel`. */
  sort?: GdeltSort;
};

/** Thrown for rejected parameters, transport failures, and timeouts. */
export class GdeltApiError extends Error {
  /** HTTP status, or 0 when the request never produced one. */
  readonly status: number;

  /**
   * Upstream body, whitespace-collapsed and truncated.
   *
   * Kept because GDELT's errors are plain text - the 429 body is the only
   * explanation available, and it names the address to contact for higher limits.
   */
  readonly body: string;

  constructor(message: string, details: { status?: number; body?: string }) {
    super(message);

    this.name = "GdeltApiError";

    this.status = details.status ?? 0;

    this.body = details.body ?? "";
  }
}

/** Collapses whitespace and truncates, so an error message stays readable. */
const excerpt = (text: string, max = 300): string => text.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Per-request ceiling.
 *
 * Live responses have been observed taking 8-26 seconds, so the default leaves
 * room well beyond that.
 */
const timeoutMs = (): number => {
  const raw = process.env.GDELT_TIMEOUT_MS;

  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
};

/**
 * Rejects parameter combinations that cannot succeed.
 *
 * Runs before any socket is opened, so a rejected call costs nothing and cannot
 * spend rate-limit budget.
 */
const validate = (params: GdeltSearchParams): void => {
  if (params.query.trim() === "") {
    throw new GdeltApiError("GDELT artlist requires a non-empty query.", {
      status: 0,
    });
  }

  if (params.maxrecords !== undefined) {
    if (
      !Number.isInteger(params.maxrecords) ||
      params.maxrecords < 1 ||
      params.maxrecords > GDELT_MAX_RECORDS
    ) {
      throw new GdeltApiError(
        `maxrecords must be an integer 1-${GDELT_MAX_RECORDS}, received ${params.maxrecords}.`,
        { status: 0 },
      );
    }
  }

  if (params.timespan !== undefined && params.timespan.trim() === "") {
    throw new GdeltApiError("timespan cannot be empty.", { status: 0 });
  }

  // Explicit windows. The stamp format is the only one GDELT accepts.
  const STAMP = /^\d{14}$/;

  if (params.startdatetime !== undefined && params.enddatetime === undefined) {
    throw new GdeltApiError("startdatetime requires enddatetime.", {
      status: 0,
    });
  }

  if (params.enddatetime !== undefined && params.startdatetime === undefined) {
    throw new GdeltApiError("enddatetime requires startdatetime.", {
      status: 0,
    });
  }

  for (const [name, value] of [
    ["startdatetime", params.startdatetime],
    ["enddatetime", params.enddatetime],
  ] as const) {
    if (value !== undefined && !STAMP.test(value)) {
      throw new GdeltApiError(`${name} must be YYYYMMDDHHMMSS in UTC, received "${value}".`, {
        status: 0,
      });
    }
  }

  if (
    params.timespan !== undefined &&
    (params.startdatetime !== undefined || params.enddatetime !== undefined)
  ) {
    throw new GdeltApiError(
      "Provide either timespan or startdatetime/enddatetime, not both. " +
        "GDELT silently prefers one window and ignores the other, and a " +
        "silently ignored filter looks exactly like one that worked.",
      { status: 0 },
    );
  }

  if (
    params.sort !== undefined &&
    !(GDELT_SORT_ORDERS as readonly string[]).includes(params.sort)
  ) {
    throw new GdeltApiError(
      `sort must be one of ${GDELT_SORT_ORDERS.join(", ")}, received "${params.sort}".`,
      { status: 0 },
    );
  }
};

/** The parameters actually sent, after defaults are applied. */
export type GdeltSentParams = {
  query: string;
  mode: string;
  format: string;

  /**
   * The relative window, or `null` when an explicit datetime range is used.
   *
   * `null` rather than the default in that case, because sending both would let
   * GDELT quietly apply whichever it preferred.
   */
  timespan: string | null;
  startdatetime: string | null;
  enddatetime: string | null;

  maxrecords: number;
  sort: string;
};

/**
 * Builds the request URL.
 *
 * `URL` and `URLSearchParams` do the encoding, so operators survive intact:
 * `-mining`, `domain:reuters.com`, `(inflation OR tariffs)`, `theme:TERROR` and
 * quoted phrases are all passed through rather than hand-assembled.
 *
 * Note that `URLSearchParams` encodes a space as `+`, so `near10:"a b"` reaches
 * the wire as `near10:"a+b"`. Whether GDELT reads that `+` as a space inside a
 * quoted phrase is **unverified**; only the round-trip through
 * `searchParams.get("query")` is guaranteed.
 */
export const buildGdeltUrl = (
  params: GdeltSearchParams,
): { url: string; sent: GdeltSentParams } => {
  const usesExplicitWindow = params.startdatetime !== undefined && params.enddatetime !== undefined;

  const sent: GdeltSentParams = {
    query: params.query,
    mode: GDELT_MODE,
    format: GDELT_FORMAT,
    timespan: usesExplicitWindow ? null : (params.timespan ?? GDELT_DEFAULT_TIMESPAN),
    startdatetime: params.startdatetime ?? null,
    enddatetime: params.enddatetime ?? null,
    maxrecords: params.maxrecords ?? GDELT_DEFAULT_MAX_RECORDS,
    sort: params.sort ?? GDELT_DEFAULT_SORT,
  };

  const url = new URL(`${getBaseUrl()}${DOC_PATH}`);

  url.searchParams.set("query", sent.query);
  url.searchParams.set("mode", sent.mode);
  url.searchParams.set("format", sent.format);

  // Exactly one window is ever sent.
  if (sent.timespan !== null) {
    url.searchParams.set("timespan", sent.timespan);
  }

  if (sent.startdatetime !== null) {
    url.searchParams.set("startdatetime", sent.startdatetime);
  }

  if (sent.enddatetime !== null) {
    url.searchParams.set("enddatetime", sent.enddatetime);
  }

  url.searchParams.set("maxrecords", String(sent.maxrecords));
  url.searchParams.set("sort", sent.sort);

  return { url: url.toString(), sent };
};

/** A completed request. */
export type GdeltSearchResponse = {
  /** Fully-resolved request URL, for provenance. */
  requestUrl: string;

  /** What was sent, after defaults. */
  sent: GdeltSentParams;

  requestedAt: string;
  status: number;
  statusText: string;
  elapsedMs: number;

  contentType: string | null;

  /** The body exactly as received. Never transformed. */
  body: string;

  /** `body` parsed as JSON, or `null` when it is not JSON. */
  bodyJson: unknown;

  /** True when the body parsed to `{}`. */
  bodyIsEmptyObject: boolean;
};

/**
 * Searches GDELT and returns the response as received.
 *
 * HTTP error statuses are **not** thrown. They are returned with the body
 * attached, so the caller decides what an error means and the provider's own
 * explanation is never lost. Only rejected parameters, transport failures and
 * timeouts throw.
 *
 * @param params Search parameters. Only `query` is required.
 * @param options `signal` for caller cancellation.
 */
export const searchGdeltArticles = async (
  params: GdeltSearchParams,
  options: { signal?: AbortSignal | undefined } = {},
): Promise<GdeltSearchResponse> => {
  validate(params);

  const { url, sent } = buildGdeltUrl(params);

  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), timeoutMs());

  const onAbort = (): void => controller.abort();

  options.signal?.addEventListener("abort", onAbort, { once: true });

  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const body = await response.text();

    let bodyJson: unknown = null;

    try {
      bodyJson = JSON.parse(body) as unknown;
    } catch {
      // Not JSON. GDELT serves plain-text and HTML bodies on some failures, and
      // reports at least one of them with HTTP 200, so a `null` here is
      // meaningful rather than exceptional.
      bodyJson = null;
    }

    return {
      requestUrl: url,
      sent,
      requestedAt: new Date().toISOString(),
      status: response.status,
      statusText: response.statusText,
      elapsedMs: Date.now() - startedAt,
      contentType: response.headers.get("content-type"),
      body,
      bodyJson,
      bodyIsEmptyObject:
        bodyJson !== null &&
        typeof bodyJson === "object" &&
        !Array.isArray(bodyJson) &&
        Object.keys(bodyJson as object).length === 0,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";

    throw new GdeltApiError(
      isAbort
        ? `GDELT request timed out after ${timeoutMs()}ms.`
        : `GDELT request failed: ${error instanceof Error ? error.message : String(error)}`,
      { status: 0 },
    );
  } finally {
    clearTimeout(timer);

    options.signal?.removeEventListener("abort", onAbort);
  }
};

/**
 * Renders a response as a short status line.
 *
 * Separates the outcomes that look alike at a glance and mean very different
 * things: a rate limit, a request GDELT refused, and a successful call that
 * matched nothing.
 */
export const describeGdeltResponse = (response: GdeltSearchResponse): string => {
  if (response.status === 429) {
    return `rate limited - ${excerpt(response.body, 120)}`;
  }

  if (response.status !== 200) {
    return `HTTP ${response.status} - ${excerpt(response.body, 120)}`;
  }

  if (response.bodyJson === null) {
    return `HTTP 200 but not JSON - ${excerpt(response.body, 120)}`;
  }

  if (response.bodyIsEmptyObject) {
    return "HTTP 200 with {} - query matched nothing";
  }

  const payload = response.bodyJson as Record<string, unknown>;

  const articles = Array.isArray(payload.articles) ? payload.articles.length : 0;

  return `HTTP 200 - ${articles} article(s)`;
};
