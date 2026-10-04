import { cleanText, isEmptyDescription, readArticles } from "./client.js";

/**
 * Normalizer for `GET /api/tags/{slug}` - articles carrying a tag.
 *
 * Projects each article down to `title` and `description`, with **HTML artefacts
 * removed**, for the same reasons as `/api/search`.
 */

/** Maximum articles returned per call. */
export const TAGS_ARTICLE_LIMIT = 5;

export type NormalizedTagArticleItem = {
  title: string;
  description: string;
};

export type NormalizedTagArticles = {
  count: number;
  items: NormalizedTagArticleItem[];
};

/**
 * Projects a raw `/api/tags/{slug}` response down to clean titles and
 * descriptions.
 *
 * Same cleaning as {@link normalizeSearch} - escaped schema.org markup, bare
 * leading URLs, multi-line posts and the literal string `Comments` all appear in
 * this feed too.
 *
 * Accepts a capture file (`{ response: { articles } }`), the raw payload, or an
 * already-extracted array.
 *
 * This endpoint is slow: the capture took **19 seconds** for 3 articles. Worth
 * knowing before it sits on an agent's critical path.
 */
export const normalizeTagArticles = (
  raw: unknown,
): NormalizedTagArticles => {
  const items = readArticles(raw)
    .slice(0, TAGS_ARTICLE_LIMIT)
    .map((article) => ({
      title: cleanText(article.title),
      description: cleanText(article.description),
    }))
    .filter((item) => item.title !== "" && !isEmptyDescription(item.description));

  return { count: items.length, items };
};