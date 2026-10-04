import { cleanText, isEmptyDescription, readArticles } from "./client.js";

/**
 * Normalizer for `GET /api/news?category=...` - the main feed, category-scoped.
 *
 * Shares `/api/news`'s article shape; the category is a query parameter rather
 * than a different route, so this is kept separate so the agent-facing output can
 * state which category it covers.
 *
 * Descriptions are cleaned exactly as in `/api/news`, since the artefacts come
 * from the source sites rather than from the route.
 */

/** Maximum articles returned per call. */
export const NEWS_CATEGORY_LIMIT = 5;

export type NormalizedNewsCategoryItem = {
  title: string;
  description: string;
};

export type NormalizedNewsCategory = {
  count: number;
  items: NormalizedNewsCategoryItem[];
};

/**
 * Projects a category-scoped `/api/news` response down to titles and
 * descriptions.
 *
 * Accepts a capture file (`{ response: { articles } }`), the raw payload, or an
 * already-extracted array.
 */
export const normalizeNewsCategory = (
  raw: unknown,
): NormalizedNewsCategory => {
  const items = readArticles(raw)
    .slice(0, NEWS_CATEGORY_LIMIT)
    .map((article) => ({
      title: cleanText(article.title),
      description: cleanText(article.description),
    }))
    .filter((item) => item.title !== "" && !isEmptyDescription(item.description));

  return { count: items.length, items };
};