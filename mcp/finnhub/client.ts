import "dotenv/config";

/**
 * REST client for the Finnhub API.
 *
 * ## Endpoint and auth
 *
 * ```
 * https://finnhub.io/api/v1/<path>?token=<API_KEY>
 * ```
 *
 * Auth is a `token` **query parameter**, on every request. There is no header
 * alternative in the public API, which means the key appears in URLs - so it is
 * never logged here, and {@link describeFinnhubRequest} redacts it for display.
 *
 * ## Rate limit
 *
 * 60 requests/minute on the free tier. Callers are expected to pace themselves;
 * the test script that exercises this client inserts a gap between calls for
 * exactly that reason.
 *
 * ## Error shape
 *
 * Finnhub answers a bad request with HTTP 200 and an object carrying only
 * `error`, rather than a 4xx. That is the trap this client guards against: a
 * 200 is not proof of success, and treating one as data produces an empty result
 * that reads as "no news".
 */

/** Base URL. Overridable to point at a mock. */
const getBaseUrl = (): string =>
  process.env.FINNHUB_BASE_URL ?? "https://finnhub.io/api/v1";

/** Reads the API key. */
const getApiKey = (): string | undefined => process.env.FINNHUB_API_KEY;

/** True when an API key is present. */
export const isFinnhubConfigured = (): boolean => Boolean(getApiKey());

/**
 * Builds a request URL with the key attached.
 *
 * The result contains the secret, so it must not be logged.
 */
export const buildFinnhubUrl = (path: string): string => {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error(
      "FINNHUB_API_KEY is not set. Add it to .env to use the Finnhub API.",
    );
  }

  const url = new URL(`${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);

  url.searchParams.set("token", apiKey);

  return url.toString();
};

/** Request URL with the token redacted, safe to log or print. */
export const describeFinnhubRequest = (path: string): string => {
  // The path may already carry a query string; appending a bare `?` would
  // produce `/news?category=general?token=...`.
  const separator = path.includes("?") ? "&" : "?";

  return `${getBaseUrl()}${path}${separator}token=***`;
};

/** Thrown for a failed request, with the upstream message preserved. */
export class FinnhubApiError extends Error {
  readonly status: number;

  readonly path: string;

  constructor(message: string, details: { status: number; path: string }) {
    super(message);

    this.name = "FinnhubApiError";
    this.status = details.status;
    this.path = details.path;
  }
}

/** Query parameters accepted across the endpoints wrapped here. */
export type FinnhubParams = {
  /** Ticker symbol, required by every `/stock/*` endpoint. */
  symbol?: string;

  /** News category: `general`, `crypto`, `forex`, `merger`, `company`. */
  category?: string;

  /** Max articles. */
  limit?: number;

  /** Offset into the result set. */
  offset?: number;

  /** Inclusive start, `YYYY-MM-DD`. */
  from?: string;

  /** Inclusive end, `YYYY-MM-DD`. */
  to?: string;

  /** Sort order, `asc` or `desc`. */
  sort?: string;

  [key: string]: string | number | undefined;
};

/** Strips undefined values so they are not serialised as "undefined". */
const toQuery = (params: FinnhubParams): URLSearchParams => {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }

  return query;
};

/**
 * Performs a request and returns the parsed JSON.
 *
 * Raises on a non-2xx **and** on a 200 carrying `{ error: "..." }`. See the
 * note at the top of this file for why the second check matters.
 */
export const finnhubRequest = async <T = unknown>(
  path: string,
  params: FinnhubParams = {},
  signal?: AbortSignal,
): Promise<T> => {
  const url = new URL(buildFinnhubUrl(path));

  for (const [key, value] of toQuery(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });

  const text = await response.text();

  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new FinnhubApiError(
      `Finnhub ${path} returned non-JSON (HTTP ${response.status}): ` +
        `${text.replace(/\s+/g, " ").slice(0, 200)}`,
      { status: response.status, path },
    );
  }

  // A rejected request arrives as HTTP 200 with an `error` field.
  const apiError =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { error?: unknown }).error
      : undefined;

  if (!response.ok || typeof apiError === "string") {
    throw new FinnhubApiError(
      `Finnhub ${path} failed (HTTP ${response.status}): ` +
        (typeof apiError === "string"
          ? apiError
          : text.replace(/\s+/g, " ").slice(0, 200)),
      { status: response.status, path },
    );
  }

  return parsed as T;
};

/** Extracts the record array, tolerating a non-array payload. */
export const readRecords = <T = Record<string, unknown>>(payload: unknown): T[] =>
  Array.isArray(payload) ? (payload as T[]) : [];

// --------------------------------------------------
// Endpoint helpers
// --------------------------------------------------

/**
 * `GET /news` - news by category.
 *
 * `category` accepts `general`, `crypto`, `forex`, `merger` and `company`.
 * The first four take no symbol; `company` requires one.
 */
export const fetchNews = async (
  params: FinnhubParams,
  signal?: AbortSignal,
): Promise<unknown> => await finnhubRequest("/news", params, signal);

/** `GET /stock/news-sentiment` - news sentiment for a symbol. */
export const fetchNewsSentiment = async (
  symbol: string,
  params: FinnhubParams = {},
  signal?: AbortSignal,
): Promise<unknown> =>
  await finnhubRequest(
    "/stock/news-sentiment",
    { ...params, symbol },
    signal,
  );

/** `GET /stock/social-sentiment` - social sentiment for a symbol. */
export const fetchSocialSentiment = async (
  symbol: string,
  params: FinnhubParams = {},
  signal?: AbortSignal,
): Promise<unknown> =>
  await finnhubRequest(
    "/stock/social-sentiment",
    { ...params, symbol },
    signal,
  );

/** `GET /stock/recommendation` - analyst recommendation trend for a symbol. */
export const fetchRecommendations = async (
  symbol: string,
  params: FinnhubParams = {},
  signal?: AbortSignal,
): Promise<unknown> =>
  await finnhubRequest(
    "/stock/recommendation",
    { ...params, symbol },
    signal,
  );

/** `GET /stock/price-target` - analyst price targets for a symbol. */
export const fetchPriceTargets = async (
  symbol: string,
  params: FinnhubParams = {},
  signal?: AbortSignal,
): Promise<unknown> =>
  await finnhubRequest(
    "/stock/price-target",
    { ...params, symbol },
    signal,
  );

/** `GET /stock/upgrade-downgrade` - analyst rating changes for a symbol. */
export const fetchUpgradesDowngrades = async (
  symbol: string,
  params: FinnhubParams = {},
  signal?: AbortSignal,
): Promise<unknown> =>
  await finnhubRequest(
    "/stock/upgrade-downgrade",
    { ...params, symbol },
    signal,
  );