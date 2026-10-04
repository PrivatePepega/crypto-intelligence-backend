import { fetchBreaking } from "../client.js";
import {
  normalizeBreaking,
  type NormalizedBreaking,
} from "../breaking.normalizer.js";

import { awaitRateLimitSlot } from "./throttle.js";

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
  await awaitRateLimitSlot();

  const payload = await fetchBreaking({ limit: options.limit });

  return normalizeBreaking(payload);
};