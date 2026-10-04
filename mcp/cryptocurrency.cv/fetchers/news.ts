import { fetchNews } from "../client.js";
import { normalizeNews, type NormalizedNews } from "../news.normalizer.js";

/**
 * Fetch and sanitize the main crypto news feed.
 *
 * Combines the request and the normalization in one call, so callers never
 * handle a raw payload. Use this rather than the client's `fetchNews`, which
 * returns the untouched shape.
 *
 * `limit` is required and has no default here - the owning tool decides it. The
 * free tier caps the actual response at 3 articles regardless of what is asked
 * for, so a larger value is not an error, just ineffective.
 *
 * @param limit Articles to request.
 */
export const getNews = async (options: {
  limit: number;
  signal?: AbortSignal | undefined;
}): Promise<NormalizedNews> => {
  // Pause before every request. This provider rate-limits hard and
  // escalates from 429 to a standing 403 block, so spacing calls out is
  // cheaper than recovering from one. Tools are invoked one per step, so a
  // plain pause is enough - no need to coordinate between callers.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const payload = await fetchNews({ limit: options.limit });

  return normalizeNews(payload);
};