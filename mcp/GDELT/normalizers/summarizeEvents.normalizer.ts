/**
 * Normalizer for `summarize_events` buckets.
 *
 * ## A bucket is not an event
 *
 * `summarize_events` (GET /api/v2/events/summary) is an aggregate rollup. It
 * returns one bucket per group with counts and metric averages, and **no ids**
 * at all - there is nothing here to feed into `get_event`. For the records
 * themselves use `search_events`.
 *
 * ## The shape changes with `group_by`
 *
 * `group_by: date` returns 5 fields. `group_by: country` returns 40 - every
 * `avg_/min_/max_` triple across significance, goldstein, magnitude and
 * confidence, plus fatality counts and rates. Both are normalized here, so a
 * caller reading `avg_significance` off a date bucket gets `null` rather than a
 * crash, and a caller reading `key` gets the right value either way.
 *
 * ## Empty buckets are null, not zero
 *
 * A day with no coverage comes back with `event_count: 0` and every optional
 * field `null` - not absent. `?? null` preserves that: a normalizer using
 * `?? 0` would turn "no data" into "zero events", which reads as a finding.
 */

/** Nested `metrics` block. Present on every bucket regardless of group_by. */
type RawMetrics = {
  significance?: {
    avg?: number | null;
    min?: number | null;
    max?: number | null;
  } | null;
  goldstein_scale?: {
    avg?: number | null;
    min?: number | null;
    max?: number | null;
    avg_severity?: number | null;
  } | null;
  goldstein_severity?: {
    avg?: number | null;
    min?: number | null;
    max?: number | null;
  } | null;
  cameoplus?: {
    magnitude?: { avg?: number | null; min?: number | null; max?: number | null } | null;
    systemic_importance?: {
      avg?: number | null;
      min?: number | null;
      max?: number | null;
    } | null;
    propagation_potential?: {
      avg?: number | null;
      min?: number | null;
      max?: number | null;
    } | null;
    market_sensitivity?: {
      avg?: number | null;
      min?: number | null;
      max?: number | null;
    } | null;
  } | null;
  confidence?: {
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
  fatalities?: {
    events?: number | null;
    rate?: number | null;
    total?: number | null;
  } | null;
};

type RawEventBucket = {
  key?: string | null;
  group_by?: string | null;
  latest_date?: string | null;

  // present on non-date groupings
  event_count?: number | null;
  conflict_event_count?: number | null;
  cameoplus_event_count?: number | null;
  fatality_event_count?: number | null;
  fatalities?: number | null;
  fatality_event_rate?: number | null;
  country_count?: number | null;
  region_count?: number | null;
  article_count?: number | null;
  avg_article_count?: number | null;
  min_article_count?: number | null;
  max_article_count?: number | null;

  avg_significance?: number | null;
  max_significance?: number | null;
  min_significance?: number | null;
  avg_goldstein_scale?: number | null;
  min_goldstein_scale?: number | null;
  max_goldstein_scale?: number | null;
  avg_goldstein_severity?: number | null;
  min_goldstein_severity?: number | null;
  max_goldstein_severity?: number | null;
  avg_magnitude?: number | null;
  min_magnitude?: number | null;
  max_magnitude?: number | null;
  avg_systemic_importance?: number | null;
  min_systemic_importance?: number | null;
  max_systemic_importance?: number | null;
  avg_propagation_potential?: number | null;
  min_propagation_potential?: number | null;
  max_propagation_potential?: number | null;
  avg_market_sensitivity?: number | null;
  min_market_sensitivity?: number | null;
  max_market_sensitivity?: number | null;
  avg_confidence?: number | null;
  min_confidence?: number | null;
  max_confidence?: number | null;

  metrics?: RawMetrics | null;
};

export type NormalizedGdeltEventSummary = {
  /** The bucket value: a date, country, region or category depending on group_by. */
  key: string | null;
  /** Which dimension produced `key`. Absent on `group_by: date` buckets. */
  groupBy: string | null;
  /** Last date with activity in the bucket; null when the bucket is empty. */
  latestDate: string | null;

  eventCount: number | null;
  conflictEventCount: number | null;
  cameoPlusEventCount: number | null;

  fatalityEventCount: number | null;
  fatalities: number | null;
  fatalityRate: number | null;

  countryCount: number | null;
  regionCount: number | null;

  articleCount: number | null;
  avgArticleCount: number | null;
  minArticleCount: number | null;
  maxArticleCount: number | null;

  avgSignificance: number | null;
  minSignificance: number | null;
  maxSignificance: number | null;

  avgGoldsteinScale: number | null;
  minGoldsteinScale: number | null;
  maxGoldsteinScale: number | null;

  avgGoldsteinSeverity: number | null;
  minGoldsteinSeverity: number | null;
  maxGoldsteinSeverity: number | null;

  avgMagnitude: number | null;
  minMagnitude: number | null;
  maxMagnitude: number | null;

  avgSystemicImportance: number | null;
  minSystemicImportance: number | null;
  maxSystemicImportance: number | null;

  avgPropagationPotential: number | null;
  minPropagationPotential: number | null;
  maxPropagationPotential: number | null;

  avgMarketSensitivity: number | null;
  minMarketSensitivity: number | null;
  maxMarketSensitivity: number | null;

  avgConfidence: number | null;
  minConfidence: number | null;
  maxConfidence: number | null;

  /** The nested metrics block, kept verbatim - see the note in the file header. */
  metrics: RawMetrics | null;
};

/**
 * Takes the `_gdelt.payload.data` array straight off a `summarize_events`
 * response, or the whole envelope - both are handled, because the envelope
 * shape is what a fetcher hands back.
 */
export const normalizeGdeltEventSummaries = (
  input: unknown,
): NormalizedGdeltEventSummary[] => {
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

  return (buckets as RawEventBucket[]).map((bucket) => ({
    key: bucket.key ?? null,
    groupBy: bucket.group_by ?? null,
    latestDate: bucket.latest_date ?? null,

    eventCount: bucket.event_count ?? null,
    conflictEventCount: bucket.conflict_event_count ?? null,
    cameoPlusEventCount: bucket.cameoplus_event_count ?? null,

    fatalityEventCount: bucket.fatality_event_count ?? null,
    fatalities: bucket.fatalities ?? null,
    fatalityRate: bucket.fatality_event_rate ?? null,

    countryCount: bucket.country_count ?? null,
    regionCount: bucket.region_count ?? null,

    articleCount: bucket.article_count ?? null,
    avgArticleCount: bucket.avg_article_count ?? null,
    minArticleCount: bucket.min_article_count ?? null,
    maxArticleCount: bucket.max_article_count ?? null,

    avgSignificance: bucket.avg_significance ?? null,
    minSignificance: bucket.min_significance ?? null,
    maxSignificance: bucket.max_significance ?? null,

    avgGoldsteinScale: bucket.avg_goldstein_scale ?? null,
    minGoldsteinScale: bucket.min_goldstein_scale ?? null,
    maxGoldsteinScale: bucket.max_goldstein_scale ?? null,

    avgGoldsteinSeverity: bucket.avg_goldstein_severity ?? null,
    minGoldsteinSeverity: bucket.min_goldstein_severity ?? null,
    maxGoldsteinSeverity: bucket.max_goldstein_severity ?? null,

    avgMagnitude: bucket.avg_magnitude ?? null,
    minMagnitude: bucket.min_magnitude ?? null,
    maxMagnitude: bucket.max_magnitude ?? null,

    avgSystemicImportance: bucket.avg_systemic_importance ?? null,
    minSystemicImportance: bucket.min_systemic_importance ?? null,
    maxSystemicImportance: bucket.max_systemic_importance ?? null,

    avgPropagationPotential: bucket.avg_propagation_potential ?? null,
    minPropagationPotential: bucket.min_propagation_potential ?? null,
    maxPropagationPotential: bucket.max_propagation_potential ?? null,

    avgMarketSensitivity: bucket.avg_market_sensitivity ?? null,
    minMarketSensitivity: bucket.min_market_sensitivity ?? null,
    maxMarketSensitivity: bucket.max_market_sensitivity ?? null,

    avgConfidence: bucket.avg_confidence ?? null,
    minConfidence: bucket.min_confidence ?? null,
    maxConfidence: bucket.max_confidence ?? null,

    metrics: bucket.metrics ?? null,
  }));
};