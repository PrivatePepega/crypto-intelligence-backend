import { readArticleRecords } from "./apiClient.js";

/**
 * Normalizer for `GET /api/1/market`.
 *
 * Projects each article down to `title` and `description`, at most
 * {@link MARKET_NEWS_LIMIT} per call.
 *
 * ## Why only these two fields
 *
 * A `/market` article carries 28 fields. Dropped here:
 *
 *  - `content` returns `ONLY AVAILABLE IN PAID PLANS`
 *  - `sentiment`, `sentiment_stats`, `ai_tag` return
 *    `ONLY AVAILABLE IN PROFESSIONAL AND CORPORATE PLANS`
 *  - `ai_org`, `ai_summary` return `ONLY AVAILABLE IN CORPORATE PLANS`
 *
 * `symbol` and `market_id` are also dropped despite being real data - see the
 * note below on why they cannot be relied on for filtering.
 *
 * ## A trap worth recording
 *
 * `/market` returns `symbol` and `market_id` on every article, which invites
 * treating them as query filters. Neither works: `symbol` is rejected with HTTP
 * 422 `UnsupportedParameter` and `market_id` with HTTP 422 `UnsupportedFilter`.
 * `/market` is filtered by `q` full-text only.
 */

/** Maximum articles returned per call. */
export const MARKET_NEWS_LIMIT = 5;

/** One projected article. */
export type NormalizedMarketNewsItem = {
  title: string;
  description: string;
};

/** Agent-facing output. */
export type NormalizedMarketNews = {
  count: number;
  items: NormalizedMarketNewsItem[];
};

/**
 * Projects a raw `/market` response down to titles and descriptions.
 *
 * Accepts a capture file (`{ response: { results } }`), the raw API envelope
 * (`{ results }`), or an already-extracted array.
 *
 * Articles missing `title` are dropped rather than emitted with an empty
 * string, so `count` always reflects usable records.
 *
 * `limit` overrides {@link MARKET_NEWS_LIMIT} so a caller - the agent tool - can
 * ask for fewer or more articles. It defaults to the constant, so existing
 * callers are unaffected.
 */
export const normalizeMarketNews = (
  raw: unknown,
  limit: number = MARKET_NEWS_LIMIT,
): NormalizedMarketNews => {
  const items = readArticleRecords(raw)
    .slice(0, limit)
    .map((article) => ({
      title: typeof article.title === "string" ? article.title : "",
      description: typeof article.description === "string" ? article.description : "",
    }))
    .filter((item) => item.title !== "");

  return { count: items.length, items };
};
