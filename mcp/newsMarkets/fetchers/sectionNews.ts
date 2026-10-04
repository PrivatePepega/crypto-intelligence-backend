import { fetchSection, type NewsMarketsInScopeSection } from "../client.js";
import {
  normalizeSectionNews,
  sliceNormalized,
  type NormalizedSectionNews,
} from "../sectionNews.normalizer.js";

/**
 * Fetch and normalize one NewsMarkets section.
 *
 * All four sections in scope share a single endpoint and a single story shape -
 * only the path segment changes - so they share one fetcher too. The
 * `category` argument is validated against
 * {@link NEWSMARKETS_IN_SCOPE_SECTIONS} at compile time, which is what keeps a
 * typo from silently requesting a valid-but-unwanted section.
 *
 * Prefer this to the client's `fetchSection`, which returns the untouched
 * payload.
 *
 * `limit` is required and has no default here - the owning tool decides it, so
 * page size lives in one place per tool.
 *
 * ## The endpoint takes no parameters
 *
 * `limit` is applied **client-side** by slicing the returned stories. It cannot
 * raise the server's 40-story cap, it only trims.
 *
 * It also means there is no paging and no offset: two calls with the same
 * `category` return the same stories from the same snapshot. See
 * {@link NEWSMARKETS_IN_SCOPE_SECTIONS} on breadth instead of repeat calls for
 * volume.
 *
 * @param category Section to request.
 * @param limit    Stories to return, applied after fetching.
 */
export const getSectionNews = async (options: {
  category: NewsMarketsInScopeSection;
  limit: number;
  signal?: AbortSignal | undefined;
}): Promise<NormalizedSectionNews> => {
  const payload = await fetchSection(options.category, options.signal);

  return sliceNormalized(
    normalizeSectionNews(payload, options.category),
    options.limit,
  );
};