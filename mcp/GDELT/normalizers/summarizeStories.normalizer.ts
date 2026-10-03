/**
 * Normalizer for `summarize_stories` buckets.
 *
 * ## A bucket is not a story
 *
 * `summarize_stories` (GET /api/v2/stories/summary) is an aggregate rollup. It
 * returns one bucket per group with counts and averages, and **no ids**. For
 * the Story records themselves use `search_stories`.
 *
 * ## Narrower than summarize_events
 *
 * The `metrics` block has 4 keys (`significance`, `article_count`,
 * `linked_events`, `fatalities`) against the events version's 7 - there are no
 * goldstein or CAMEO+ sub-scores, because a Story has no source/target actor.
 *
 * ## Story-specific counts
 *
 * `storiesWithEvents` / `storyOnlyCount` split the bucket into Stories that
 * link coded Events and those that do not. `linkedEventCount` is a Story-to-
 * Event link aggregate, not a count of distinct Events - upstream states this
 * explicitly, and it is easy to misread as a distinct-event total.
 */

type RawMetrics = {
  significance?: {
    avg?: number | null;
    min?: number | null;
    max?: number | null;
  } | null;
  article_count?: {
    total?: number | null;
    avg?: number | null;
    min?: number | null;
    max?: number | null;
  } | null;
  linked_events?: { count?: number | null } | null;
  fatalities?: {
    stories?: number | null;
    rate?: number | null;
    total?: number | null;
  } | null;
};

type RawStoryBucket = {
  key?: string | null;
  group_by?: string | null;
  latest_date?: string | null;

  story_count?: number | null;
  article_count?: number | null;
  avg_article_count?: number | null;
  min_article_count?: number | null;
  max_article_count?: number | null;

  stories_with_events?: number | null;
  story_only_count?: number | null;
  linked_event_count?: number | null;
  min_linked_event_count?: number | null;
  avg_linked_event_count?: number | null;
  max_linked_event_count?: number | null;

  stories_with_fatalities?: number | null;
  fatalities?: number | null;
  fatality_story_rate?: number | null;

  country_count?: number | null;
  region_count?: number | null;

  avg_significance?: number | null;
  min_significance?: number | null;
  max_significance?: number | null;

  metrics?: RawMetrics | null;
};

export type NormalizedGdeltStorySummary = {
  /** The bucket value: a date, country, region or category depending on group_by. */
  key: string | null;
  /** Which dimension produced `key`. Absent on `group_by: date` buckets. */
  groupBy: string | null;
  /** Last date with activity in the bucket; null when the bucket is empty. */
  latestDate: string | null;

  storyCount: number | null;

  articleCount: number | null;
  avgArticleCount: number | null;
  minArticleCount: number | null;
  maxArticleCount: number | null;

  /** Stories that link at least one coded Event. */
  storiesWithEvents: number | null;
  /** Stories with no linked Event - narrative only. */
  storyOnlyCount: number | null;
  /**
   * Story-to-Event links, NOT distinct Events. Upstream is explicit that this
   * is a link aggregate, so it can exceed the number of linked Events.
   */
  linkedEventCount: number | null;
  minLinkedEventCount: number | null;
  avgLinkedEventCount: number | null;
  maxLinkedEventCount: number | null;

  storiesWithFatalities: number | null;
  fatalities: number | null;
  fatalityStoryRate: number | null;

  countryCount: number | null;
  regionCount: number | null;

  avgSignificance: number | null;
  minSignificance: number | null;
  maxSignificance: number | null;

  /** The nested metrics block, kept verbatim. */
  metrics: RawMetrics | null;
};

/**
 * Takes the `_gdelt.payload.data` array straight off a `summarize_stories`
 * response, or the whole envelope.
 */
export const normalizeGdeltStorySummaries = (
  input: unknown,
): NormalizedGdeltStorySummary[] => {
  const buckets = Array.isArray(input)
    ? input
    : (
        input as {
          response?: {
            _gdelt?: { payload?: { data?: unknown } };
          };
        }
      )?.response?._gdelt?.payload?.data;

  if (!Array.isArray(buckets)) {
    return [];
  }

  return (buckets as RawStoryBucket[]).map((bucket) => ({
    key: bucket.key ?? null,
    groupBy: bucket.group_by ?? null,
    latestDate: bucket.latest_date ?? null,

    storyCount: bucket.story_count ?? null,

    articleCount: bucket.article_count ?? null,
    avgArticleCount: bucket.avg_article_count ?? null,
    minArticleCount: bucket.min_article_count ?? null,
    maxArticleCount: bucket.max_article_count ?? null,

    storiesWithEvents: bucket.stories_with_events ?? null,
    storyOnlyCount: bucket.story_only_count ?? null,
    linkedEventCount: bucket.linked_event_count ?? null,
    minLinkedEventCount: bucket.min_linked_event_count ?? null,
    avgLinkedEventCount: bucket.avg_linked_event_count ?? null,
    maxLinkedEventCount: bucket.max_linked_event_count ?? null,

    storiesWithFatalities: bucket.stories_with_fatalities ?? null,
    fatalities: bucket.fatalities ?? null,
    fatalityStoryRate: bucket.fatality_story_rate ?? null,

    countryCount: bucket.country_count ?? null,
    regionCount: bucket.region_count ?? null,

    avgSignificance: bucket.avg_significance ?? null,
    minSignificance: bucket.min_significance ?? null,
    maxSignificance: bucket.max_significance ?? null,

    metrics: bucket.metrics ?? null,
  }));
};