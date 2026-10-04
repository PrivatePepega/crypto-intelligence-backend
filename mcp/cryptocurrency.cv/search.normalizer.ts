import { cleanText, isEmptyDescription, readArticles } from "./client.js";

/**
 * Normalizer for `GET /api/search` - keyword search.
 *
 * Projects each article down to `title` and `description`, with **HTML artefacts
 * removed**.
 */

/** Maximum articles returned per call. */
export const SEARCH_LIMIT = 5;

export type NormalizedSearchItem = {
  title: string;
  description: string;
};

export type NormalizedSearch = {
  count: number;
  items: NormalizedSearchItem[];
};

/**
 * Projects a raw `/api/search` response down to clean titles and descriptions.
 *
 * This feed needs cleaning where `/api/news` does not. Observed in the capture:
 *
 *  - escaped markup, where a source scraped a schema.org block as text:
 *    `&lt;span property="schema:name" class="field..."&gt;Quantum Isn't Coming
 *    For Your Bitcoin&lt;/span&gt;`
 *  - a bare link used as the whole description:
 *    `https://www.tradingview.com/x/Z5iP5jRY/`
 *  - multi-line TradingView posts
 *  - the literal string `Comments`, which is page furniture from the source site
 *    rather than a summary
 *
 * `cleanText` decodes entities, strips tags, drops a leading URL and collapses
 * newlines, in that order. Items whose description reduces to nothing usable are
 * dropped rather than emitted empty.
 *
 * Accepts a capture file (`{ response: { articles } }`), the raw payload, or an
 * already-extracted array.
 */
export const normalizeSearch = (raw: unknown): NormalizedSearch => {
  const items = readArticles(raw)
    .slice(0, SEARCH_LIMIT)
    .map((article) => ({
      title: cleanText(article.title),
      description: cleanText(article.description),
    }))
    .filter((item) => item.title !== "" && !isEmptyDescription(item.description));

  return { count: items.length, items };
};