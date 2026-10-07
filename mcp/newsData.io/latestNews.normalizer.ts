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

/**
 * Hard ceiling on `description`, in characters.
 *
 * `/latest` descriptions are unbounded - measured across 40 captured articles:
 * median 298, but a maximum of **44,238**. One field was carrying roughly 11,000
 * tokens on its own, which is the entire point at which a headline feed stops
 * being usable in a prompt.
 *
 * 400 characters is roughly 60-80 tokens, enough to carry a real standfirst
 * while bounding the worst case. Measured before capping: 25% of `/latest`
 * descriptions exceeded it.
 */
export const DESCRIPTION_MAX_CHARS = 400;

/**
 * Trims a description to {@link DESCRIPTION_MAX_CHARS}, appending an ellipsis
 * when anything was removed.
 *
 * Cuts on a word boundary so a truncated sentence does not end mid-word, but
 * only when doing so still leaves most of the budget - a description whose first
 * "word" runs past 60% of the cap is cut hard rather than collapsing to nothing.
 *
 * Internal whitespace runs are collapsed to single spaces. Descriptions arrive
 * with paragraph breaks, which would otherwise spend a meaningful share of a
 * 400-character budget on newline characters.
 *
 * Non-strings and empty strings become `""`, matching the previous behaviour.
 */
export const truncateDescription = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  const collapsed = value.replace(/\s+/g, " ").trim();

  if (collapsed.length <= DESCRIPTION_MAX_CHARS) {
    return collapsed;
  }

  const cut = collapsed.slice(0, DESCRIPTION_MAX_CHARS);

  const lastSpace = cut.lastIndexOf(" ");

  const body =
    lastSpace > DESCRIPTION_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace).trimEnd() : cut.trimEnd();

  return `${body}…`;
};

/** One projected article. */
export type NormalizedLatestNewsItem = {
  title: string;
  /** Trimmed to {@link DESCRIPTION_MAX_CHARS}. */
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
 * Descriptions pass through {@link truncateDescription}, so no article can
 * contribute an unbounded amount of context.
 *
 * `limit` overrides {@link LATEST_NEWS_LIMIT} so a caller - the agent tool - can
 * ask for fewer or more articles. It defaults to the constant, so existing
 * callers are unaffected.
 *
 * Articles missing `title` are dropped rather than emitted with an empty
 * string, so `count` always reflects usable records.
 */
export const normalizeLatestNews = (
  raw: unknown,
  limit: number = LATEST_NEWS_LIMIT,
): NormalizedLatestNews => {
  const items = readArticleRecords(raw)
    .slice(0, limit)
    .map((article) => ({
      title: typeof article.title === "string" ? article.title : "",
      description: truncateDescription(article.description),
    }))
    .filter((item) => item.title !== "");

  return { count: items.length, items };
};
