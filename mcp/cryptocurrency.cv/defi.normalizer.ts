import { cleanText, isEmptyDescription, readArticles } from "./client.js";

/**
 * Normalizer for `GET /api/defi` - DeFi-specific news.
 *
 * Projects each article down to `title` and `description`.
 */

export type NormalizedDefiItem = {
  title: string;
  description: string;
};

export type NormalizedDefiNews = {
  count: number;
  items: NormalizedDefiItem[];
};

/**
 * Projects a raw `/api/defi` response down to titles and descriptions.
 *
 * Accepts a capture file (`{ response: { articles } }`), the raw payload, or an
 * already-extracted array.
 *
 * Descriptions are cleaned for escaped markup, newlines and bare leading URLs.
 *
 * Worth knowing: this feed carries non-DeFi promotional content - the first item
 * in one capture was a sports-betting promo code (`Kalshi Promo Code RATE...`).
 * Selecting the right feed is the fix for that, not filtering here.
 */
export const normalizeDefiNews = (raw: unknown): NormalizedDefiNews => {
  const items = readArticles(raw)
    .map((article) => ({
      title: cleanText(article.title),
      description: cleanText(article.description),
    }))
    .filter((item) => item.title !== "" && !isEmptyDescription(item.description));

  return { count: items.length, items };
};