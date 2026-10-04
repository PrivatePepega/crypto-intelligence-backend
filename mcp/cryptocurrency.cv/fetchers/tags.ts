import { fetchTagArticles } from "../client.js";
import {
  normalizeTagArticles,
  type NormalizedTagArticles,
} from "../tagsArticles.normalizer.js";

/**
 * Fetch and sanitize the articles carrying a given tag.
 *
 * Combines the request and the normalization in one call, with the same cleaning
 * as search - escaped markup, bare URLs and `Comments` descriptions all appear
 * here.
 *
 * **Slow.** A measured call took 10.8 seconds, an order of magnitude slower than
 * any other endpoint, so give it a generous timeout or keep it off a critical
 * path.
 *
 * @param slug  Tag slug, e.g. `bitcoin` or `ethereum`.
 * @param limit Articles to request.
 */
export const getTagArticles = async (
  slug: string,
  options: { limit: number; signal?: AbortSignal | undefined },
): Promise<NormalizedTagArticles> => {
  const payload = await fetchTagArticles(slug, { limit: options.limit });

  return normalizeTagArticles(payload);
};