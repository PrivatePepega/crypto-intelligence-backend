import { fetchBitcoinNews } from "../client.js";
import {
  normalizeBitcoinNews,
  type NormalizedBitcoinNews,
} from "../bitcoin.normalizer.js";

import { awaitRateLimitSlot } from "./throttle.js";

/**
 * Fetch and sanitize Bitcoin-specific news.
 *
 * Combines the request and the normalization in one call.
 *
 * Expect a low yield: this feed frequently carries articles whose only
 * description is the literal string `Comments`, scraped from the publisher's
 * page furniture. Those are dropped, so a request for 5 commonly yields only 1
 * or 2 usable items. That filtering happens in the normalizer, not here, so
 * raising `limit` is the way to get more through.
 *
 * @param limit Articles to request.
 */
export const getBitcoinNews = async (options: {
  limit: number;
  signal?: AbortSignal | undefined;
}): Promise<NormalizedBitcoinNews> => {
  await awaitRateLimitSlot();

  const payload = await fetchBitcoinNews({ limit: options.limit });

  return normalizeBitcoinNews(payload);
};