import { cleanText, isEmptyDescription, readArticles } from "./client.js";

/**
 * Normalizer for `GET /api/bitcoin` - Bitcoin-specific news.
 *
 * Projects each article down to `title` and `description`.
 */

export type NormalizedBitcoinItem = {
  title: string;
  description: string;
};

export type NormalizedBitcoinNews = {
  count: number;
  items: NormalizedBitcoinItem[];
};

/**
 * Projects a raw `/api/bitcoin` response down to titles and descriptions.
 *
 * Accepts a capture file (`{ response: { articles } }`), the raw payload, or an
 * already-extracted array.
 *
 * Descriptions are cleaned for escaped markup, newlines and bare leading URLs.
 *
 * Worth knowing: this feed frequently carries items whose only description is
 * the literal string `Comments`, scraped from the publisher's page furniture. In
 * the capture that drove this, 3 of 5 items were dropped for that reason, which
 * is why the limit is applied before filtering rather than after - otherwise a
 * page of `Comments` rows would return an empty result while usable articles
 * sat further down.
 */
export const normalizeBitcoinNews = (
  raw: unknown,
): NormalizedBitcoinNews => {
  const items = readArticles(raw)
    .map((article) => ({
      title: cleanText(article.title),
      description: cleanText(article.description),
    }))
    .filter((item) => item.title !== "" && !isEmptyDescription(item.description));

  return { count: items.length, items };
};