import { fetchBitcoinNews } from "../client.js";
import {
  normalizeBitcoinNews,
  type NormalizedBitcoinNews,
} from "../bitcoin.normalizer.js";

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
  // Pause before every request. This provider rate-limits hard and
  // escalates from 429 to a standing 403 block, so spacing calls out is
  // cheaper than recovering from one. Tools are invoked one per step, so a
  // plain pause is enough - no need to coordinate between callers.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const payload = await fetchBitcoinNews({ limit: options.limit });

  return normalizeBitcoinNews(payload);
};