import { fetchTrending } from "../client.js";
import {
  normalizeTrending,
  type NormalizedTrending,
} from "../trending.normalizer.js";

/**
 * Fetch and sanitize trending topics.
 *
 * Combines the request and the normalization in one call.
 *
 * A different shape from every other fetcher here: this endpoint returns no
 * articles, returning `{ trending: [...], timeWindow, articlesAnalyzed }`
 * instead, so the output carries a topic's sentiment and its recent headlines
 * rather than a list of articles.
 *
 * Expect overlap between topics. One capture had `Stablecoins` and `Binance`
 * sharing an identical headline list, which suggests the same article set can be
 * grouped under several topics.
 *
 * @param limit Trends to request.
 */
export const getTrendingTopics = async (options: {
  limit: number;
  signal?: AbortSignal | undefined;
}): Promise<NormalizedTrending> => {
  // Pause before every request. This provider rate-limits hard and
  // escalates from 429 to a standing 403 block, so spacing calls out is
  // cheaper than recovering from one. Tools are invoked one per step, so a
  // plain pause is enough - no need to coordinate between callers.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const payload = await fetchTrending({ limit: options.limit });

  return normalizeTrending(payload);
};