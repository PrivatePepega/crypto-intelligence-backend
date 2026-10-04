import { cleanText, isEmptyDescription, readArticles } from "./client.js";

/**
 * Normalizer for `GET /api/news` - the main crypto news feed.
 *
 * Projects each article down to `title` and `description`.
 */

export type NormalizedNewsItem = {
  title: string;
  description: string;
};

export type NormalizedNews = {
  count: number;
  items: NormalizedNewsItem[];
};

/**
 * Projects a raw `/api/news` response down to titles and descriptions.
 *
 * Accepts a capture file (`{ response: { articles } }`), the raw payload
 * (`{ articles }`), or an already-extracted array.
 *
 * Descriptions are cleaned, and it is worth being explicit that this was not
 * obvious. A first capture came back clean, and a normalizer was written to pass
 * descriptions through untouched on that basis. A later capture of the same
 * endpoint contained escaped schema.org markup and embedded newlines:
 *
 * ```
 * &lt;span property="schema:name" class="field..."&gt;25 States Ask Supreme
 * Court To End Maine's 72-Hour Gun-Purchase Wait&lt;/span&gt;
 * ```
 *
 * The artefacts are source-dependent, not endpoint-dependent, so cleaning has to
 * be unconditional. Items whose description reduces to the literal string
 * `Comments` - page furniture scraped from the publisher - are dropped.
 */
export const normalizeNews = (raw: unknown): NormalizedNews => {
  const items = readArticles(raw)
    .map((article) => ({
      title: cleanText(article.title),
      description: cleanText(article.description),
    }))
    .filter((item) => item.title !== "" && !isEmptyDescription(item.description));

  return { count: items.length, items };
};