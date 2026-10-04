import { fetchDefiNews } from "../client.js";
import {
  normalizeDefiNews,
  type NormalizedDefiNews,
} from "../defi.normalizer.js";

/**
 * Fetch and sanitize DeFi-specific news.
 *
 * Combines the request and the normalization in one call.
 *
 * This feed carries some non-DeFi promotional content - one capture opened with
 * a sports-betting promo code - so callers wanting only protocol news should
 * expect to discard some results themselves.
 *
 * @param limit Articles to request.
 */
export const getDefiNews = async (options: {
  limit: number;
  signal?: AbortSignal | undefined;
}): Promise<NormalizedDefiNews> => {
  // Pause before every request. This provider rate-limits hard and
  // escalates from 429 to a standing 403 block, so spacing calls out is
  // cheaper than recovering from one. Tools are invoked one per step, so a
  // plain pause is enough - no need to coordinate between callers.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const payload = await fetchDefiNews({ limit: options.limit });

  return normalizeDefiNews(payload);
};