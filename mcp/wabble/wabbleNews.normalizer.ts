import {
  fetchNews,
  WABBLE_ACCOUNT_CATEGORIES,
  WABBLE_MAX_LIMIT,
  type WabbleImportance,
  type WabbleNewsResponse,
} from "./client.js";

/**
 * Normalizer for `GET /v1/news?categories=markets&importance=...`.
 *
 * Projects each article down to `headline` and `importance`.
 *
 * ## Why only those two fields
 *
 * `headline` and `importance` are the whole projection, and the reason is
 * specific to this feed rather than a matter of taste.
 *
 * Measured 2026-10-04 across the 64-article markets pool:
 *
 *  - **`excerpt` is populated on 3 of 64.** There is no summary field to
 *    project. Worse, where it does exist it is not independent text: on all
 *    three, `headline` is a strict prefix of `excerpt`, because `headline` is
 *    the first 180 characters of the item's text and nothing longer ever
 *    appears. `excerpt` therefore carries no information the headline lacks
 *    except the 180-character tail - not worth the field.
 *  - **`importance` is the only classification the API offers.** There are no
 *    tags, channels, tickers or categories beyond the single `markets` value
 *    every item shares.
 *
 * Every other field on the raw item is either metadata this backend does not
 * need, or unusable:
 *
 * | Field | Why it is dropped |
 * | --- | --- |
 * | `publishedAt` etc. | Epoch ms. All 64 items are published by the single synthetic publisher `Wabble News`, and `timestampBasis` varies between `wabble_channel` (56) and `feed_timestamp` (8), so the timestamp means different things per item. |
 * | `sourcePublishedAt` | `null` on 56 of 64. |
 * | `provenance` | `upstreamSource` is `not_disclosed` on every item; there is no real attribution to surface. |
 * | `imageUrl` | A relative path (`/assets/news/<sha>.jpg`) needing the API root joined, and `imageRights.status` is `unknown` with `commercialUse` `null` on all 64. |
 * | `id` | An opaque `wn_<hex>` with no use outside this API. |
 */

/** One normalized article. */
export type NormalizedWabbleArticle = {
  headline: string;
  importance: WabbleImportance | null;
};

export type NormalizedWabbleNews = {
  count: number;
  items: NormalizedWabbleArticle[];
};

/**
 * Projects one importance slice down to headlines and importance.
 *
 * Accepts a live response, a capture file (`{ response: { data } }`) or a bare
 * envelope (`{ data }`).
 *
 * Articles with an empty headline are dropped - there is no headline, so there
 * is nothing left once `importance` is accounted for. The count reflects what
 * survived, which can be lower than the envelope's own `count`.
 */
export const normalizeWabbleNews = (raw: unknown): NormalizedWabbleNews => {
  // Unwrap the capture envelope, then read `data`.
  const payload =
    raw && typeof raw === "object" && !Array.isArray(raw) && "response" in raw
      ? ((raw as { response: unknown }).response ?? raw)
      : raw;

  const source =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { data?: unknown }).data
      : undefined;

  const records = Array.isArray(source)
    ? (source as Record<string, unknown>[])
    : [];

  const items = records
    .map((record) => ({
      headline:
        typeof record.headline === "string" ? record.headline.trim() : "",
      importance:
        typeof record.importance === "string"
          ? (record.importance as WabbleImportance)
          : null,
    }))
    .filter((item) => item.headline !== "");

  return { count: items.length, items };
};

/** Fetches one importance slice and returns it normalized. */
export const fetchMarketsNews = async (options: {
  importance: WabbleImportance;
  limit?: number;
  signal?: AbortSignal | undefined;
}): Promise<NormalizedWabbleNews> => {
  const response: WabbleNewsResponse = await fetchNews(
    {
      categories: WABBLE_ACCOUNT_CATEGORIES.join(","),
      importance: options.importance,
      limit: options.limit ?? WABBLE_MAX_LIMIT,
    },
    options.signal,
  );

  return normalizeWabbleNews(response);
};

/**
 * The importance levels fetched, in request order.
 *
 * High first: it is the slice a caller actually wants and the small one, so a
 * failure there is visible rather than buried under 59 mediums.
 *
 * `low` is absent because it was measured at **0 articles** on this plan.
 */
export const WABBLE_MARKETS_LEVELS = ["high", "medium"] as const satisfies
  readonly WabbleImportance[];

/** Result of a combined fetch. */
export type NormalizedWabbleHeadlines = {
  count: number;
  items: NormalizedWabbleArticle[];
  /**
   * Per-slice counts, in fetch order.
   *
   * Reporting only - each item carries its own `importance`, so this is not
   * needed to tell the slices apart.
   */
  slices: { importance: WabbleImportance; count: number }[];
};

/**
 * Fetches every in-scope importance slice and returns them concatenated.
 *
 * **One trigger, both slices.** This is what a no-argument tool calls, and it
 * is also what `showNormalized.ts` calls, so the reviewed output and the tool's
 * live output come from a single code path and cannot drift apart.
 *
 * The slices do not overlap: 5 + 59 = 64, the whole unfiltered markets pool, so
 * concatenating cannot double-count.
 *
 * The requests are issued sequentially with a short pause. This provider is a
 * republished feed behind a weekly quota, not a rate-limited live API - see the
 * header in `wabble.test.ts` for the measurements.
 */
export const fetchMarketsHeadlines = async (options: {
  /** Per-slice request cap. Both slices fit: high 5, medium 59. */
  limit?: number | undefined;
  signal?: AbortSignal | undefined;
}): Promise<NormalizedWabbleHeadlines> => {
  const items: NormalizedWabbleArticle[] = [];

  const slices: { importance: WabbleImportance; count: number }[] = [];

  for (const importance of WABBLE_MARKETS_LEVELS) {
    const normalized = await fetchMarketsNews({
      importance,
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    items.push(...normalized.items);

    slices.push({ importance, count: normalized.count });

    // Pause between slices so the two fetches are not back to back.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return { count: items.length, items, slices };
};

/**
 * Trims a normalized result to `limit` articles.
 *
 * Not needed for the two slices in scope - high returns 5 and medium 59, both
 * under the 100 cap - but it keeps a caller from relying on that holding as
 * the corpus grows.
 */
export const sliceNormalized = (
  normalized: NormalizedWabbleNews,
  limit: number,
): NormalizedWabbleNews => ({
  count: Math.min(normalized.count, Math.max(0, limit)),
  items: normalized.items.slice(0, Math.max(0, limit)),
});