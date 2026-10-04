import { fetchBreaking } from "../client.js";
import {
  normalizeBreaking,
  type NormalizedBreaking,
} from "../breaking.normalizer.js";

/**
 * Fetch and sanitize breaking crypto news, covering roughly the last two hours.
 *
 * Combines the request and the normalization in one call. Newlines are collapsed
 * out of titles and descriptions, since this feed carries multi-line TradingView
 * posts.
 *
 * A known content problem, recorded rather than filtered: the feed interleaves
 * price widgets with news. One capture opened with an ETH gas ticker reading
 * `ETH Gas: 0.098534701 | 0.098549143 | 0.099534701 Gwei`, which is not a
 * headline. Separating those needs a source or category filter this endpoint
 * does not usefully expose.
 *
 * @param limit Articles to request.
 */
export const getBreakingNews = async (options: {
  limit: number;
  signal?: AbortSignal | undefined;
}): Promise<NormalizedBreaking> => {
  // Pause before every request. This provider rate-limits hard and
  // escalates from 429 to a standing 403 block, so spacing calls out is
  // cheaper than recovering from one. Tools are invoked one per step, so a
  // plain pause is enough - no need to coordinate between callers.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const payload = await fetchBreaking({ limit: options.limit });

  return normalizeBreaking(payload);
};