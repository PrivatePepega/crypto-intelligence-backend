import "dotenv/config";

/**
 * REST client for the NewsData.io API v1.
 *
 * ## Why REST and not the MCP server
 *
 * NewsData.io publishes an MCP server (`newsdata-mcp`), but it is a Python
 * package that has to be launched as a child process, and it **flattens the
 * JSON response into a line-oriented text digest**. Measured against the same
 * query, the MCP tool returns:
 *
 *   { "result": "endpoint: latest\ntotal_results: 1253\nArticle 1:\ntitle: ..." }
 *
 * where the REST API returns real JSON. Since the goal is to build our own
 * tools over these endpoints, going direct avoids parsing that digest and
 * avoids a Python process in the request path.
 *
 * The MCP client in `client.ts` is kept for reference but is superseded by this
 * one.
 *
 * ## Endpoints (all eight, from the v1 docs)
 *
 *   GET /latest          news from the last 48 hours
 *   GET /archive         historical news            (paid plans)
 *   GET /crypto          crypto news
 *   GET /market          stock market / financial news
 *   GET /sources         publisher directory
 *   GET /count           article counts, archive
 *   GET /crypto/count    article counts, crypto
 *   GET /market/count    article counts, market
 *
 * ## Authentication
 *
 * `apikey` as a query parameter, per the docs' own examples.
 *
 * ## Constraints, measured rather than documented
 *
 * 1. **A filter is no longer required.** The 2023-08-16 changelog said a query
 *    must carry one of `q`, `q_in_title`, `domain`, ... or it will not work.
 *    That is not enforced any more: a bare `GET /latest` succeeds and returns
 *    779630 total results. An earlier version of this client enforced the old
 *    rule and would have rejected valid calls.
 * 2. **There is no working ticker filter on `/market`.** The 2026-07-28
 *    changelog says `symbol` was replaced by `market_id`, but neither works:
 *    `symbol` -> HTTP 422 `UnsupportedParameter` ("You can't use the symbol
 *    parameter in the /1/market endpoint"), and `market_id` -> HTTP 422
 *    `UnsupportedFilter`. Both still appear as *response* fields. Use `q` for
 *    full-text search instead.
 * 3. **`size` is capped by plan.** The free plan rejects `size=50` with HTTP
 *    422 `UnsupportedFilter`; 10 is the documented free-tier maximum.
 */

/** Base URL for the v1 API. Overridable to point at a mock. */
const getBaseUrl = (): string =>
  process.env.NEWSDATA_BASE_URL ?? "https://newsdata.io/api/1";

/**
 * Reads the API key.
 *
 * `NEWSDATA_API_KEY` is the name NewsData.io documents; `NEWADATA_IO_API_KEY` is
 * accepted as an alias so either convention in this project's .env works.
 */
const getApiKey = (): string | undefined =>
  process.env.NEWSDATA_API_KEY ?? process.env.NEWADATA_IO_API_KEY;

/** True when an API key is present. */
export const isNewsDataConfigured = (): boolean => Boolean(getApiKey());

/** Human-readable endpoint description. Safe to log; holds no secret. */
export const describeNewsDataBaseUrl = (): string => getBaseUrl();

/**
 * Largest `size` accepted on the free plan.
 *
 * `size=50` is rejected with HTTP 422 `UnsupportedFilter`; 10 is the documented
 * free-tier maximum. Clamp rather than sending a larger value and having the
 * whole call fail.
 */
export const FREE_PLAN_MAX_SIZE = 10;

/** Query parameters accepted by the article endpoints. */
export type NewsDataParams = {
  /** Full-text query. Supports AND / OR / NOT and parentheses. */
  q?: string;
  q_in_title?: string;
  q_in_meta?: string;
  country?: string;
  exclude_country?: string;
  category?: string;
  exclude_category?: string;
  language?: string;
  exclude_language?: string;
  domain?: string[];
  domainurl?: string;
  exclude_domain?: string;
  /** `top` | `medium` | `low` */
  priority_domain?: string;
  /** Max articles to return. Free plan caps at 10. */
  size?: number;
  /** 0-based page index. */
  page?: number;
  from_date?: string;
  to_date?: string;
  /** `asc` | `desc` */
  sort?: string;
  sentiment?: string;
  tag?: string;
  region?: string;
  organization?: string;
  creator?: string;
  datatype?: string;
  /** Coin filter, `/crypto` only, e.g. `btc`. */
  coin?: string;
  /**
   * Ticker filter, `/market` only. Replaced `symbol` on 2026-07-28; format is
   * `TICKER-COUNTRY-EXCHANGE`, e.g. `AAPL-US-NASDAQ`.
   */
  market_id?: string;
  /** `/count` endpoints only: `all` | `hour` | `day`. */
  interval?: string;
  [key: string]: string | number | string[] | undefined;
};

/** The envelope every NewsData.io endpoint returns. */
export type NewsDataEnvelope<T> = {
  status?: "success" | "error";
  results?: T;
  totalResults?: number;
  nextPage?: string | null;
};

/** An article as NewsData.io returns it. */
export type NewsDataArticle = {
  article_id?: string;
  title?: string;
  url?: string;
  link?: string;
  content?: string | null;
  description?: string | null;
  pubDate?: string;
  pubDateTZ?: string;
  fetched_at?: string;
  language?: string;
  country?: string[] | null;
  category?: string[] | null;
  creator?: string[] | null;
  keywords?: string[] | null;
  datatype?: string;
  sentiment?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  source_id?: string;
  source_name?: string;
  source_url?: string;
  source_priority?: number;
  duplicate?: boolean;
  [key: string]: unknown;
};

/** A publisher entry from `/sources`. */
export type NewsDataSource = {
  source_id?: string;
  source_name?: string;
  source_url?: string;
  source_icon?: string;
  source_priority?: number;
  [key: string]: unknown;
};

/** Thrown for any non-success response, with the upstream message preserved. */
export class NewsDataApiError extends Error {
  readonly status: number;

  readonly path: string;

  readonly code: string | undefined;

  constructor(
    message: string,
    details: { status: number; path: string; code?: string | undefined },
  ) {
    super(message);

    this.name = "NewsDataApiError";
    this.status = details.status;
    this.path = details.path;
    this.code = details.code;
  }
}

/**
 * Clamps `size` to the free-plan maximum.
 *
 * A `size` above the plan's cap fails the whole request with HTTP 422, so
 * clamping here turns a rejected call into a smaller successful one.
 */
export const clampSize = (size: number | undefined): number | undefined => {
  if (size === undefined) {
    return undefined;
  }

  return Math.max(1, Math.min(Math.trunc(size), FREE_PLAN_MAX_SIZE));
};

/** Strips undefined values so they are not serialised as "undefined". */
const cleanParams = (params: NewsDataParams): Record<string, string> => {
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    output[key] = Array.isArray(value) ? value.join(",") : String(value);
  }

  return output;
};

/**
 * Applies the plan limits that the API enforces by rejecting the whole call.
 *
 * An oversized `size` fails with HTTP 422 rather than being silently capped, so
 * clamping here turns a rejected request into a smaller successful one.
 */
const withPlanLimits = (params: NewsDataParams): NewsDataParams => {
  const size = clampSize(params.size);

  return size === undefined ? params : { ...params, size };
};

/**
 * Calls a NewsData.io endpoint and returns the parsed envelope.
 *
 * Raises {@link NewsDataApiError} on an HTTP failure *and* on a 200 response
 * carrying `status: "error"`. That second case is real: plan refusals come back
 * as HTTP 403 with an error body, and validation failures come back as HTTP 200
 * with `status: "error"`, so checking only the HTTP status would let a failure
 * through as a success.
 */
export const newsDataRequest = async <T = unknown>(
  path: string,
  params: NewsDataParams = {},
  signal?: AbortSignal,
): Promise<NewsDataEnvelope<T>> => {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new NewsDataApiError(
      "No NewsData.io API key found. Set NEWSDATA_API_KEY (or " +
        "NEWADATA_IO_API_KEY) in .env.",
      { status: 0, path },
    );
  }

  const url = new URL(`${getBaseUrl()}/${path.replace(/^\//, "")}`);

  url.searchParams.set("apikey", apiKey);

  for (const [key, value] of Object.entries(cleanParams(params))) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });

  const text = await response.text();

  let body: unknown;

  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new NewsDataApiError(
      `NewsData.io returned non-JSON (HTTP ${response.status}): ` +
        `${text.slice(0, 200)}`,
      { status: response.status, path },
    );
  }

  const envelope = body as NewsDataEnvelope<T> & {
    results?: unknown;
  };

  // Validation and plan errors arrive as HTTP 200 with status "error".
  const errorBody =
    envelope.status === "error" && envelope.results &&
    typeof envelope.results === "object"
      ? (envelope.results as { message?: string; code?: string })
      : undefined;

  if (!response.ok || envelope.status === "error") {
    const code = errorBody?.code;

    const detail =
      errorBody?.message ??
      (typeof envelope.results === "string" ? envelope.results : undefined) ??
      text.slice(0, 200);

    throw new NewsDataApiError(
      `NewsData.io ${path} failed (HTTP ${response.status}${
        code ? `, ${code}` : ""
      }): ${detail}`,
      { status: response.status, path, code },
    );
  }

  return envelope;
};

/** Extracts the article array from an envelope. */
export const readArticles = (
  envelope: NewsDataEnvelope<NewsDataArticle[]>,
): NewsDataArticle[] =>
  Array.isArray(envelope.results) ? envelope.results : [];

/**
 * Reads the article array out of whatever the caller happens to have.
 *
 * Three shapes are accepted so a normalizer never has to care which one it was
 * handed:
 *
 *   1. `{ response: { results: [...] } }` - a `captureRaw.ts` file
 *   2. `{ results: [...] }`               - the raw API envelope
 *   3. `[...]`                             - an already-extracted array
 *
 * Returns an empty array when there is nothing to read, so callers can iterate
 * unconditionally.
 */
export const readArticleRecords = (raw: unknown): Record<string, unknown>[] => {
  const asArray = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

  if (Array.isArray(raw)) {
    return asArray(raw);
  }

  if (typeof raw !== "object" || raw === null) {
    return [];
  }

  const record = raw as Record<string, unknown>;

  // Shape 1: a capture file wrapping the envelope.
  const wrapped = record.response;

  if (wrapped && typeof wrapped === "object") {
    const results = (wrapped as Record<string, unknown>).results;

    if (results !== undefined) {
      return asArray(results);
    }
  }

  // Shape 2: the bare envelope.
  return asArray(record.results);
};

/** Extracts the source array from an envelope. */
export const readSources = (
  envelope: NewsDataEnvelope<NewsDataSource[]>,
): NewsDataSource[] =>
  Array.isArray(envelope.results) ? envelope.results : [];

// --------------------------------------------------
// Endpoint helpers
// --------------------------------------------------

/** `GET /latest` - news from the last 48 hours. */
export const fetchLatestNews = async (
  params: NewsDataParams,
  signal?: AbortSignal,
) => {
  return await newsDataRequest<NewsDataArticle[]>(
    "latest",
    withPlanLimits(params),
    signal,
  );
};

/** `GET /archive` - historical news. Paid plans only. */
export const fetchArchiveNews = async (
  params: NewsDataParams,
  signal?: AbortSignal,
) => {
  return await newsDataRequest<NewsDataArticle[]>(
    "archive",
    withPlanLimits(params),
    signal,
  );
};

/** `GET /crypto` - crypto news. */
export const fetchCryptoNews = async (
  params: NewsDataParams,
  signal?: AbortSignal,
) => {
  return await newsDataRequest<NewsDataArticle[]>(
    "crypto",
    withPlanLimits(params),
    signal,
  );
};

/** `GET /market` - stock market and financial news. */
export const fetchMarketNews = async (
  params: NewsDataParams,
  signal?: AbortSignal,
) => {
  return await newsDataRequest<NewsDataArticle[]>(
    "market",
    withPlanLimits(params),
    signal,
  );
};

/** `GET /sources` - publisher directory. */
export const fetchNewsSources = async (
  params: NewsDataParams = {},
  signal?: AbortSignal,
) => await newsDataRequest<NewsDataSource[]>("sources", params, signal);

/** `GET /count` - aggregate article counts across the archive. */
export const fetchNewsCount = async (
  params: NewsDataParams,
  signal?: AbortSignal,
) => {
  return await newsDataRequest<Record<string, number>>(
    "count",
    params,
    signal,
  );
};

/** `GET /crypto/count` - aggregate counts for crypto news. */
export const fetchCryptoCount = async (
  params: NewsDataParams,
  signal?: AbortSignal,
) => {
  return await newsDataRequest<Record<string, number>>(
    "crypto/count",
    params,
    signal,
  );
};

/** `GET /market/count` - aggregate counts for market news. */
export const fetchMarketCount = async (
  params: NewsDataParams,
  signal?: AbortSignal,
) => {
  return await newsDataRequest<Record<string, number>>(
    "market/count",
    params,
    signal,
  );
};