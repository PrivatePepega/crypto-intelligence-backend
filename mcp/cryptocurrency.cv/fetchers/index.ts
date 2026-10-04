/**
 * Fetchers for cryptocurrency.cv.
 *
 * Each fetcher combines one request with its normalizer, so callers get clean
 * output and never handle a raw payload. The client's `fetch*` functions remain
 * the escape hatch for the raw shape.
 *
 * Every fetcher requires a `limit` and applies no default of its own - the
 * default lives in the owning AI tool, so page size is decided in one place per
 * tool rather than in each normalizer. None is validated against the account's
 * plan, because the free tier silently caps responses at 3 articles regardless
 * of what is requested.
 */

export { getNews } from "./news.js";
export { getBitcoinNews } from "./bitcoin.js";
export { getDefiNews } from "./defi.js";
export { getBreakingNews } from "./breaking.js";
export { searchNews } from "./search.js";
export { getTrendingTopics } from "./trending.js";
export { getTagArticles } from "./tags.js";