import "dotenv/config";

/**
 * REST client for the cryptocurrency.cv News API.
 *
 * ## Endpoint
 *
 * ```
 * https://cryptocurrency.cv/api/...
 * ```
 *
 * **No authentication.** Verified 2026-10-03: `GET /api/news` returns HTTP 200
 * with data and no key, header or query credential. There is no API-key env var
 * in this project and none is needed.
 *
 * ## The spec disagrees with the written docs
 *
 * An OpenAPI 3.1 document is served at `/openapi.json` - 393 paths, far more
 * than the news endpoints. Checked against it, the written brief is wrong or
 * incomplete in several places:
 *
 * | Endpoint | Brief says | Spec says |
 * | --- | --- | --- |
 * | `/api/news/{slug}` | GET, retrieve by slug | **not in the spec at all** |
 * | `/api/search/semantic` | GET, `q` + `limit` | **POST**, no query params |
 * | `/api/news/extract` | POST body `{ url }` | POST, `url` as a **query** param |
 * | `/api/news` | `limit`, `page`, `source`, `category`, `lang` | only `sort`, `sources` |
 * | `/api/breaking` | `limit`, `lang`, `translate` | only `lang` |
 * | `/api/search` | `q`, `limit`, `from`, `to` | only `semantic` |
 * | `/api/tags` | `limit` | `slug`, `category`, `sort` |
 *
 * The spec's `parameters` lists are almost certainly incomplete rather than
 * authoritative - it is unusual for an API to omit `limit` everywhere - so this
 * client passes through whatever it is given and lets the server decide. What
 * each endpoint actually accepts is established by `captureRaw.ts`, not by
 * either document.
 *
 * Not documented in the brief but present in the spec, and worth knowing about:
 * `/api/articles`, `/api/news/categories`, `/api/news/stream`, `/api/search/v2`.
 */

/** Base URL. Overridable to point at a mock. */
const getBaseUrl = (): string =>
  process.env.CRYPTOCV_BASE_URL ?? "https://cryptocurrency.cv";

/** Human-readable endpoint description. Safe to log. */
export const describeCryptoCvBaseUrl = (): string => getBaseUrl();

/**
 * True when a base URL is configured.
 *
 * There is no API key for this provider, so unlike the other clients this only
 * reports whether the endpoint is reachable in principle.
 */
export const isCryptoCvConfigured = (): boolean => Boolean(getBaseUrl());

/** Query parameters accepted by the news endpoints. */
export type CryptoCvParams = {
  /** Number of articles, documented as 1-100. */
  limit?: number;

  /** Page index for pagination. */
  page?: number;

  /** Result offset. */
  offset?: number;

  /** Filter by source, e.g. `coindesk`. */
  source?: string;
  sources?: string;

  /** Filter by category, e.g. `bitcoin`, `defi`. */
  category?: string;

  /** Filter by tag slug. */
  slug?: string;

  /** Language code, e.g. `en`, `es`, `ja`. */
  lang?: string;
  language?: string;

  /** Translate results. Sent as `true`. */
  translate?: boolean;

  /** Free-text query. */
  q?: string;

  /** Start date, `YYYY-MM-DD`. */
  from?: string;

  /** End date, `YYYY-MM-DD`. */
  to?: string;

  /** Region filter for `/api/news/international`. */
  region?: string;

  /** Sort order. */
  sort?: string;

  /** Enable semantic rather than keyword search. */
  semantic?: boolean;

  /** Lookback window in hours, for `/api/trending`. */
  hours?: number;

  /** Article URL, for `/api/news/extract` and `/api/article`. */
  url?: string;

  /** Article title, for `/api/article`. */
  title?: string;

  /** Article source, for `/api/article`. */
  source_name?: string;

  [key: string]: string | number | boolean | undefined;
};

/** Thrown for a non-2xx response, with the upstream body preserved. */
export class CryptoCvApiError extends Error {
  readonly status: number;

  readonly path: string;

  readonly body: string;

  constructor(message: string, details: { status: number; path: string; body: string }) {
    super(message);

    this.name = "CryptoCvApiError";
    this.status = details.status;
    this.path = details.path;
    this.body = details.body;
  }
}

/** Strips undefined values so they are not serialised as "undefined". */
const toQuery = (params: CryptoCvParams): URLSearchParams => {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    query.set(key, String(value));
  }

  return query;
};

/** Reads a possibly-absent property from an arbitrary value. */
const prop = <T>(value: unknown, key: string): T | undefined =>
  typeof value === "object" && value !== null
    ? ((value as Record<string, unknown>)[key] as T | undefined)
    : undefined;

/**
 * Performs a request and returns the parsed JSON.
 *
 * Raises {@link CryptoCvApiError} on any non-2xx. The body is kept on the error
 * because this API returns HTML for some failures, which would otherwise be
 * reported as a JSON parse failure.
 */
const request = async (
  method: "GET" | "POST",
  path: string,
  params: CryptoCvParams = {},
  body?: unknown,
): Promise<unknown> => {
  const url = new URL(`${getBaseUrl()}${path}`);

  const query = toQuery(params);

  for (const [key, value] of query) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new CryptoCvApiError(
      `cryptocurrency.cv ${path} failed (HTTP ${response.status}): ` +
        `${text.replace(/\s+/g, " ").slice(0, 300)}`,
      { status: response.status, path, body: text.slice(0, 2000) },
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CryptoCvApiError(
      `cryptocurrency.cv ${path} returned non-JSON (HTTP ${response.status}): ` +
        `${text.replace(/\s+/g, " ").slice(0, 200)}`,
      { status: response.status, path, body: text.slice(0, 2000) },
    );
  }
};

/** `GET <path>` with query parameters. */
export const cryptoCvGet = async (
  path: string,
  params: CryptoCvParams = {},
): Promise<unknown> => await request("GET", path, params);

/** `POST <path>` with query parameters and an optional JSON body. */
export const cryptoCvPost = async (
  path: string,
  params: CryptoCvParams = {},
  body?: unknown,
): Promise<unknown> => await request("POST", path, params, body);

/**
 * Extracts the article array from a response.
 *
 * Accepts three shapes so a normalizer never has to care which it was handed:
 *
 *   1. `{ response: { articles: [...] } }` - a `captureRaw.ts` file
 *   2. `{ articles: [...] }`               - the raw API payload
 *   3. `[...]`                             - an already-extracted array
 *
 * The container key varies by endpoint - `articles` on the news feeds, `results`
 * on some - so all the common names are tried rather than assuming one.
 *
 * Returns an empty array when nothing matches. Endpoints that return no articles
 * at all (`/api/trending` returns `trending`, `/api/tags` returns `tags`) will
 * legitimately produce `[]` here, which is why those have their own normalizers.
 */
export const readArticles = (payload: unknown): Record<string, unknown>[] => {
  // Shape 1: a capture file wrapping the payload.
  const target =
    typeof payload === "object" && payload !== null
      ? (prop<unknown>(payload, "response") ?? payload)
      : payload;

  if (Array.isArray(target)) {
    return target as Record<string, unknown>[];
  }

  for (const key of ["articles", "results", "data", "items"]) {
    const value = prop<unknown>(target, key);

    if (Array.isArray(value)) {
      return value as Record<string, unknown>[];
    }
  }

  return [];
};

/** Union of keys across the given records. */
export const unionFields = (records: Record<string, unknown>[]): string[] => {
  const keys = new Set<string>();

  for (const record of records) {
    for (const key of Object.keys(record)) {
      keys.add(key);
    }
  }

  return [...keys];
};

// --------------------------------------------------
// Endpoint helpers
//
// Only endpoints with a normalizer behind them are kept, so the client and the
// tool surface cannot drift apart. `/api/search/semantic` is the one exception:
// it has no normalizer yet and is kept while its behaviour is still being
// established - see `fetchSemanticSearch` below.
//
// Removed as unused:
//   GET  /api/news/international  different article shape, region filter no-op
//   GET  /api/tags               metadata, never consumed by a tool
//   GET  /api/article            single object, no normalizer
//   POST /api/news/extract       single object, no normalizer
// --------------------------------------------------

/** `GET /api/news` - the main crypto news feed. */
export const fetchNews = async (params: CryptoCvParams = {}) =>
  await cryptoCvGet("/api/news", params);

/** `GET /api/breaking` - urgent news, roughly the last two hours. */
export const fetchBreaking = async (params: CryptoCvParams = {}) =>
  await cryptoCvGet("/api/breaking", params);

/** `GET /api/search` - keyword search. */
export const fetchSearch = async (params: CryptoCvParams = {}) =>
  await cryptoCvGet("/api/search", params);

/** `GET /api/trending` - trending topics and keywords. */
export const fetchTrending = async (params: CryptoCvParams = {}) =>
  await cryptoCvGet("/api/trending", params);

/** `GET /api/bitcoin` - Bitcoin-specific news. */
export const fetchBitcoinNews = async (params: CryptoCvParams = {}) =>
  await cryptoCvGet("/api/bitcoin", params);

/** `GET /api/defi` - DeFi-specific news. */
export const fetchDefiNews = async (params: CryptoCvParams = {}) =>
  await cryptoCvGet("/api/defi", params);

/** `GET /api/tags/{slug}` - articles carrying a given tag. */
export const fetchTagArticles = async (
  slug: string,
  params: CryptoCvParams = {},
) => await cryptoCvGet(`/api/tags/${encodeURIComponent(slug)}`, params);

/**
 * Semantic search - and it is **not** a search endpoint.
 *
 * Kept in the client without a normalizer because its behaviour is still being
 * established. See `semanticSearch.test.ts`, which probes it in isolation.
 *
 * Measured 2026-10-03. The written brief calls this
 * `GET /api/search/semantic?q=...`. Reality:
 *
 *  - `GET` returns **405 Method Not Allowed** on every query-parameter form.
 *  - `POST` with `{ q }` returns `400 {"error":"query is required"}`.
 *  - `POST` with `{ query }` returns
 *    `400 {"error":"articles array is required and must not be empty"}`.
 *
 * The real contract is a **reranker**: the caller supplies the candidate
 * articles and gets a score per article back.
 *
 * ```
 * POST { query: string, articles: Array<{title, description}> }
 *   -> { results: [{ score: number }], query: string, total: number }
 * ```
 *
 * `limit` is accepted and ignored - `total` always equals the input length.
 * Articles may be plain strings; they score identically to objects.
 *
 * ## The scores are not semantic
 *
 * Despite the name, scoring is **exact term match, 1 or 0**:
 *
 * | Query | Article | Score |
 * | --- | --- | --- |
 * | `SEC approves spot Bitcoin ETF` | `SEC approves spot Bitcoin ETF` | `1.0` |
 * | `US regulation of crypto` | `SEC approves spot Bitcoin ETF` | `0` |
 * | `regulation` | `Treasury stablecoin rules` | `0` |
 * | gibberish | anything | `0` |
 *
 * Rows two and three are matches a human would call obvious. There is no
 * synonymy or concept understanding, so this is weaker than the plain keyword
 * search on `/api/search`. Do not treat it as vector search.
 */
export const fetchSemanticSearch = async (
  query: string,
  articles: unknown[],
): Promise<CryptoCvSemanticResponse> => {
  const payload = await cryptoCvPost("/api/search/semantic", {}, {
    query,
    articles,
  });

  return payload as CryptoCvSemanticResponse;
};

/** One scored article from {@link fetchSemanticSearch}. */
export type CryptoCvSemanticResult = {
  /** 1 for an exact term match, 0 otherwise. */
  score?: number;

  [key: string]: unknown;
};

/** Shape returned by {@link fetchSemanticSearch}. */
export type CryptoCvSemanticResponse = {
  results?: CryptoCvSemanticResult[];
  query?: string;
  total?: number;
};

// --------------------------------------------------
// Text cleaning
// --------------------------------------------------

/** HTML entities that turn up escaped inside descriptions. */
const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
  "&amp;": "&",
};

/**
 * Decodes HTML entities, including numeric ones.
 *
 * Needed because some descriptions arrive with markup **already escaped** -
 * `&lt;span property="schema:name"...&gt;` - so stripping tags alone would leave
 * the entity text behind.
 */
const decodeEntities = (value: string): string => {
  const named = Object.entries(ENTITIES).reduce(
    (text, [entity, character]) => text.split(entity).join(character),
    value,
  );

  const numeric = named.replace(/&#(\d+);/g, (_, code: string) =>
    String.fromCharCode(Number(code)),
  );

  // Sources truncate descriptions mid-entity, leaving a dangling `&lt` with no
  // closing semicolon. The strict patterns above miss those, so a partial entity
  // at the very end is dropped. Anchored to the end deliberately: a bare `&`
  // mid-string is far more likely to be real text ("AT&T") than a broken entity.
  return numeric.replace(/&(#\d{0,7}|[a-zA-Z]{1,8})$/, "");
};

/** Options for {@link cleanText}. */
export type CleanTextOptions = {
  /**
   * Collapse every newline and carriage return into a single space. Default
   * true - several descriptions embed multi-line blocks, and a raw newline in a
   * tool result is noise for a model.
   */
  collapseNewlines?: boolean;

  /** Strip HTML tags after decoding entities. Default true. */
  stripTags?: boolean;
};

/**
 * Removes the artefacts that appear in descriptions.
 *
 * Observed across the captures, in the order they need handling:
 *
 * 1. escaped markup  `&lt;span property="schema:name"...&gt;`
 * 2. real markup     `<div property="schema:text">`
 * 3. bare URLs       `https://www.tradingview.com/x/Z5iP5jRY/`
 * 4. newlines        multi-line TradingView posts
 * 5. whitespace      runs of spaces left behind
 */
export const cleanText = (
  value: unknown,
  options: CleanTextOptions = {},
): string => {
  if (typeof value !== "string") {
    return "";
  }

  const { collapseNewlines = true, stripTags = true } = options;

  let text = decodeEntities(value);

  if (stripTags) {
    text = text.replace(/<[^>]*>/g, " ");
  }

  // A description that is only a link carries no information.
  text = text.replace(/^\s*https?:\/\/\S+\s*/i, "");

  if (collapseNewlines) {
    text = text.replace(/\s*[\r\n]+\s*/g, " ");
  }

  return text.replace(/[ \t]{2,}/g, " ").trim();
};

/**
 * True when a description carries no usable content.
 *
 * Some descriptions are the literal string `Comments`, which is a page-furniture
 * leak from the source site rather than a summary.
 */
export const isEmptyDescription = (value: string): boolean =>
  value === "" || /^comments?$/i.test(value);