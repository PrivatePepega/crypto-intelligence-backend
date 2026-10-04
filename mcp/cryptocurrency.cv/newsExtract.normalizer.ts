import { cleanText, isEmptyDescription } from "./client.js";

/**
 * Normalizer for `POST /api/news/extract` - full article text from a URL.
 *
 * Projects the extracted article down to `title` and `description`.
 */

/** Maximum articles returned per call. */
export const NEWS_EXTRACT_LIMIT = 5;

export type NormalizedNewsExtractItem = {
  title: string;
  description: string;
};

export type NormalizedNewsExtract = {
  count: number;
  items: NormalizedNewsExtractItem[];
};

/**
 * Projects a `/api/news/extract` response down to titles and descriptions.
 *
 * ## Not an array
 *
 * This endpoint returns a **single object**, not a list:
 *
 * ```
 * { url, title, content, author, published_date, description, image,
 *   word_count, reading_time_minutes }
 * ```
 *
 * There is no `articles` key, so `readArticles` finds nothing and the projection
 * reads the object directly. Sharing the article-array path with the news feeds
 * made this return `count: 0` against a perfectly good capture.
 *
 * Accepts a capture file (`{ response: {...} }`), the raw payload, or the object
 * itself.
 *
 * `content` is the **extracted article body**, not a summary, so it runs to
 * thousands of characters - far longer than the other feeds' descriptions. There
 * is no truncation here by design; a caller wanting a headline view should
 * truncate downstream rather than have it happen invisibly.
 */
export const normalizeNewsExtract = (
  raw: unknown,
): NormalizedNewsExtract => {
  const payload =
    typeof raw === "object" && raw !== null
      ? ((raw as { response?: unknown }).response ?? raw)
      : raw;

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { count: 0, items: [] };
  }

  const article = payload as Record<string, unknown>;

  const title = cleanText(article.title);

  if (title === "") {
    return { count: 0, items: [] };
  }

  // `description` is the publisher's summary when present; the extracted body is
  // the fallback. `/api/article` uses `content` for the same thing.
  const description = cleanText(article.description || article.content);

  return {
    count: 1,
    items: isEmptyDescription(description) ? [{ title, description: "" }] : [{ title, description }],
  };
};