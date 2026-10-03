import { readArticleRecords } from "./apiClient.js";

/**
 * Normalizer for `GET /api/1/latest`.
 *
 * Projects each article down to `title` and `description`, at most
 * {@link LATEST_NEWS_LIMIT} per call.
 *
 * ## Why only these two fields
 *
 * A `/latest` article carries 28 fields - the widest set of the three endpoints.
 * Dropped here:
 *
 *  - `content` returns `ONLY AVAILABLE IN PAID PLANS`
 *  - `sentiment`, `sentiment_stats`, `ai_tag` return
 *    `ONLY AVAILABLE IN PROFESSIONAL AND CORPORATE PLANS`
 *  - `ai_region`, `ai_org`, `ai_summary` return
 *    `ONLY AVAILABLE IN CORPORATE PLANS`
 *
 * All of them are present and non-empty, so a "does this field exist" check
 * passes and yields the placeholder text rather than data.
 *
 * Kept source metadata is also out of scope for headline monitoring: `link`,
 * `source_name`, `source_priority`, `pubDate` and friends belong on the record
 * rather than in a prompt, and are available from the raw response.
 */

/** Maximum articles returned per call. */
export const LATEST_NEWS_LIMIT = 5;

/** One projected article. */
export type NormalizedLatestNewsItem = {
  title: string;
  description: string;
};

/** Agent-facing output. */
export type NormalizedLatestNews = {
  count: number;
  items: NormalizedLatestNewsItem[];
};

/**
 * Projects a raw `/latest` response down to titles and descriptions.
 *
 * Accepts a capture file (`{ response: { results } }`), the raw API envelope
 * (`{ results }`), or an already-extracted array.
 *
 * Articles missing `title` are dropped rather than emitted with an empty
 * string, so `count` always reflects usable records.
 */
export const normalizeLatestNews = (raw: unknown): NormalizedLatestNews => {
  const items = readArticleRecords(raw)
    .slice(0, LATEST_NEWS_LIMIT)
    .map((article) => ({
      title: typeof article.title === "string" ? article.title : "",
      description:
        typeof article.description === "string" ? article.description : "",
    }))
    .filter((item) => item.title !== "");

  return { count: items.length, items };
};