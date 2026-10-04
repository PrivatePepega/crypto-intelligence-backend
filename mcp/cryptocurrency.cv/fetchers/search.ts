import { fetchSearch } from "../client.js";
import {
  normalizeSearch,
  type NormalizedSearch,
} from "../search.normalizer.js";

/**
 * Fetch and sanitize keyword search results.
 *
 * Combines the request and the normalization in one call.
 *
 * This feed needs the cleaning more than any other: sources scraped into it
 * leave escaped schema.org markup, bare leading URLs and multi-line posts. All
 * three are removed, and results whose description reduces to the literal string
 * `Comments` are dropped.
 *
 * Note that the API's `from` and `to` date filters are **accepted and ignored** -
 * a request with a date window returns a byte-identical result set to one
 * without. They are deliberately not exposed rather than offered and silently
 * ignored.
 *
 * @param query  Search text. Supports AND, OR, NOT and parentheses.
 * @param limit  Results to request.
 */
export const searchNews = async (
  query: string,
  options: { limit: number; signal?: AbortSignal | undefined },
): Promise<NormalizedSearch> => {
  // Pause before every request. This provider rate-limits hard and
  // escalates from 429 to a standing 403 block, so spacing calls out is
  // cheaper than recovering from one. Tools are invoked one per step, so a
  // plain pause is enough - no need to coordinate between callers.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const payload = await fetchSearch({
    q: query,
    limit: options.limit,
  });

  return normalizeSearch(payload);
};