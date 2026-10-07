import { readArticleRecords } from "./apiClient.js";

/**
 * Normalizer for `GET /api/1/crypto`.
 *
 * Projects each article down to `title` and `description`, at most
 * {@link CRYPTO_NEWS_LIMIT} per call.
 *
 * ## Why only these two fields
 *
 * A `/crypto` article carries 23 fields. The rest are either unusable on the
 * current plan or not wanted for headline-level monitoring:
 *
 *  - `content` returns the literal string `ONLY AVAILABLE IN PAID PLANS`
 *  - `sentiment` and `sentiment_stats` return
 *    `ONLY AVAILABLE IN PROFESSIONAL AND CORPORATE PLANS`
 *  - `ai_tag` is likewise a placeholder
 *
 * Those are **present and non-empty**, so a "does this field exist" check passes
 * and hands the caller the placeholder text itself. Dropping them here is
 * cheaper than filtering them per field.
 *
 * `description` is the useful one: 141-579 characters of real summary text,
 * against a `title` of 65-101 characters.
 */

/** Maximum articles returned per call. */
export const CRYPTO_NEWS_LIMIT = 5;

/** One projected article. */
export type NormalizedCryptoNewsItem = {
  title: string;
  description: string;
};

/** Agent-facing output. */
export type NormalizedCryptoNews = {
  count: number;
  items: NormalizedCryptoNewsItem[];
};

/**
 * Projects a raw `/crypto` response down to titles and descriptions.
 *
 * Accepts a capture file (`{ response: { results } }`), the raw API envelope
 * (`{ results }`), or an already-extracted array.
 *
 * Articles missing `title` are dropped rather than emitted with an empty
 * string, so `count` always reflects usable records.
 *
 * `limit` overrides {@link CRYPTO_NEWS_LIMIT} so a caller - the agent tool - can
 * ask for fewer or more articles. It defaults to the constant, so existing
 * callers are unaffected.
 */
export const normalizeCryptoNews = (
  raw: unknown,
  limit: number = CRYPTO_NEWS_LIMIT,
): NormalizedCryptoNews => {
  const items = readArticleRecords(raw)
    .slice(0, limit)
    .map((article) => ({
      title: typeof article.title === "string" ? article.title : "",
      description: typeof article.description === "string" ? article.description : "",
    }))
    .filter((item) => item.title !== "");

  return { count: items.length, items };
};
