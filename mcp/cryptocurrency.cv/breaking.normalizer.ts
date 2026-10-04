import { cleanText, isEmptyDescription, readArticles } from "./client.js";

/**
 * Normalizer for `GET /api/breaking` - urgent news, roughly the last two hours.
 *
 * Projects each article down to `title` and `description`, with **all newlines
 * removed**.
 */

export type NormalizedBreakingItem = {
  title: string;
  description: string;
};

export type NormalizedBreaking = {
  count: number;
  items: NormalizedBreakingItem[];
};

/**
 * Projects a raw `/api/breaking` response down to titles and descriptions.
 *
 * Newlines are collapsed to single spaces via `cleanText`, which also decodes
 * HTML entities and strips tags. That is deliberate rather than incidental: the
 * breaking feed carries multi-line TradingView posts whose raw newlines are
 * noise in a tool result.
 *
 * Accepts a capture file (`{ response: { articles } }`), the raw payload, or an
 * already-extracted array.
 *
 * A known content problem, recorded rather than filtered: the capture's first
 * item was an ETH gas ticker reading
 * `ETH Gas: 0.098534701 | 0.098549143 | 0.099534701 Gwei`, which is a price
 * widget rather than news. Distinguishing those needs a source or category
 * filter this endpoint does not usefully expose.
 */
export const normalizeBreaking = (raw: unknown): NormalizedBreaking => {
  const items = readArticles(raw)
    .map((article) => ({
      title: cleanText(article.title),
      description: cleanText(article.description),
    }))
    .filter((item) => item.title !== "" && !isEmptyDescription(item.description));

  return { count: items.length, items };
};