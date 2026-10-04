import "dotenv/config";

/**
 * REST client for the NewsMarkets data API.
 *
 * ## Endpoint
 *
 * ```
 * https://newsmarkets-data.alykhanii.workers.dev
 * ```
 *
 * Deployed on Cloudflare Workers, serving **static JSON files** under
 * `/data/v1/`. Every route ends in `.json` and takes no query parameters - this
 * is a published snapshot, not a queryable API. There is nothing to filter, page
 * or parameterise, so the client exposes one function per file and no options
 * beyond an abort signal.
 *
 * **No authentication.** No API key, header or credential of any kind.
 *
 * ## A snapshot, not a live feed
 *
 * Every payload carries `generated_at` and `schema_version`. Two payloads
 * fetched seconds apart report the same `generated_at` if a refresh has not
 * happened in between, so the timestamp is the only way to tell whether the
 * data is fresh. Callers that care should surface it.
 */

const getBaseUrl = (): string =>
  process.env.NEWSMARKETS_BASE_URL ??
  "https://newsmarkets-data.alykhanii.workers.dev";

/** Human-readable endpoint description. Safe to log; holds no secret. */
export const describeNewsMarketsBaseUrl = (): string => getBaseUrl();

/**
 * Always true for this provider.
 *
 * There is no key to configure, so unlike the other clients this reports nothing
 * useful. Kept so callers can treat every provider the same way.
 */
export const isNewsMarketsConfigured = (): boolean => true;

/** Sections available under `/data/v1/sections/{section}.json`. */
export const NEWSMARKETS_SECTIONS = [
  "politics",
  "world",
  "business",
  "tech",
  "ai",
  "crypto",
  "sports",
  "science",
  "weather",
  "culture",
  "music",
  "startups",
  "health",
] as const;

export type NewsMarketsSection = (typeof NEWSMARKETS_SECTIONS)[number];

/** Thrown for a failed request, with the upstream body preserved. */
export class NewsMarketsApiError extends Error {
  readonly status: number;

  readonly path: string;

  constructor(message: string, details: { status: number; path: string }) {
    super(message);

    this.name = "NewsMarketsApiError";
    this.status = details.status;
    this.path = details.path;
  }
}

/**
 * Fetches a JSON document from the API.
 *
 * Raises {@link NewsMarketsApiError} on any non-2xx, and on a 2xx that is not
 * JSON - a Cloudflare Worker returning an HTML error page with a 200 is the
 * failure mode worth guarding.
 */
export const newsMarketsGet = async <T = unknown>(
  path: string,
  signal?: AbortSignal,
): Promise<T> => {
  const url = new URL(`${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new NewsMarketsApiError(
      `NewsMarkets ${path} failed (HTTP ${response.status}): ` +
        `${text.replace(/\s+/g, " ").slice(0, 200)}`,
      { status: response.status, path },
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NewsMarketsApiError(
      `NewsMarkets ${path} returned non-JSON (HTTP ${response.status}): ` +
        `${text.replace(/\s+/g, " ").slice(0, 200)}`,
      { status: response.status, path },
    );
  }
};

/** Reads a possibly-absent property from an arbitrary value. */
export const prop = <T>(value: unknown, key: string): T | undefined =>
  typeof value === "object" && value !== null
    ? ((value as Record<string, unknown>)[key] as T | undefined)
    : undefined;

/** The `generated_at` timestamp every payload carries. */
export const readGeneratedAt = (payload: unknown): string | null => {
  const value = prop<unknown>(payload, "generated_at");

  return typeof value === "string" ? value : null;
};

/** Reads an array field, tolerating its absence. */
export const readArray = <T = Record<string, unknown>>(
  payload: unknown,
  key: string,
): T[] => {
  const value = prop<unknown>(payload, key);

  return Array.isArray(value) ? (value as T[]) : [];
};

// --------------------------------------------------
// Endpoint helpers
// --------------------------------------------------

/**
 * `GET /data/v1/front.json`
 *
 * The front page: story of the day, top stories per section, markets moving,
 * and news vs. market. Observed top-level keys:
 * `accelerating`, `coming_up`, `generated_at`, `markets_moving`, `moved_first`,
 * `news_vs_market`, `schema_version`, `sections`, `story_of_the_day`.
 */
export const fetchFront = async (
  signal?: AbortSignal,
): Promise<unknown> => await newsMarketsGet("/data/v1/front.json", signal);

/**
 * `GET /data/v1/sections/{section}.json`
 *
 * Up to 40 stories in a section. Observed top-level keys:
 * `generated_at`, `schema_version`, `section`, `stories`, `total`.
 */
export const fetchSection = async (
  section: NewsMarketsSection | string,
  signal?: AbortSignal,
): Promise<unknown> =>
  await newsMarketsGet(
    `/data/v1/sections/${encodeURIComponent(section)}.json`,
    signal,
  );

/** `GET /data/v1/topics/index.json` - every topic page. */
export const fetchTopicsIndex = async (
  signal?: AbortSignal,
): Promise<unknown> => await newsMarketsGet("/data/v1/topics/index.json", signal);

/**
 * `GET /data/v1/topics/{slug}.json` - a topic's stories and markets.
 *
 * Slugs come from {@link fetchTopicsIndex}; entries there are
 * `{ name, slug, story_count }`.
 */
export const fetchTopic = async (
  slug: string,
  signal?: AbortSignal,
): Promise<unknown> =>
  await newsMarketsGet(
    `/data/v1/topics/${encodeURIComponent(slug)}.json`,
    signal,
  );

/**
 * `GET /data/v1/trending.json`
 *
 * Biggest 24-hour moves and most-traded markets. Observed top-level keys:
 * `generated_at`, `min_volume_24h`, `movers`, `schema_version`, `volume`.
 */
export const fetchTrending = async (
  signal?: AbortSignal,
): Promise<unknown> => await newsMarketsGet("/data/v1/trending.json", signal);

/**
 * `GET /data/v1/signals.json`
 *
 * News vs. market: big stories with still markets, and moving markets on quiet
 * stories. Observed top-level keys: `big_move`, `generated_at`,
 * `loud_market_quiet_news`, `loud_news_quiet_market`, `loud_publishers_24h`,
 * `min_volume_24h`, `quiet_publishers_24h`, `schema_version`, `still_move`.
 */
export const fetchSignals = async (
  signal?: AbortSignal,
): Promise<unknown> => await newsMarketsGet("/data/v1/signals.json", signal);