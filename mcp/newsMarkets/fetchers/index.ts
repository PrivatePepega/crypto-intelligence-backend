/**
 * Fetchers for NewsMarkets.
 *
 * Each fetcher combines one request with its normalizer, so callers get clean
 * output and never handle a raw payload. The client's `fetch*` functions remain
 * the escape hatch for the raw shape.
 *
 * One fetcher, because there is one endpoint. The four sections in scope - `ai`,
 * `business`, `crypto`, `tech` - differ only in their path segment and share an
 * identical story shape, so `getSectionNews` takes the section as an argument
 * rather than there being four near-identical wrappers.
 *
 * `limit` is required and applies no default of its own - the default belongs in
 * the owning AI tool, so page size is decided in one place per tool. It is
 * applied client-side because the endpoint accepts no parameters; it cannot raise
 * the server's 40-story cap.
 */

export { getSectionNews } from "./sectionNews.js";