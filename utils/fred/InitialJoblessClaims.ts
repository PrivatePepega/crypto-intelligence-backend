import { fredObservations, fredSeries } from "../../collectors/fred/fred.fetch.js";
import { z } from "zod";
import "dotenv/config";

export const FredSeriesSchema = z.object({
  id: z.string(),
  realtime_start: z.string(),
  realtime_end: z.string(),
  title: z.string(),
  observation_start: z.string(),
  observation_end: z.string(),
  frequency: z.string(),
  frequency_short: z.string(),
  units: z.string(),
  units_short: z.string(),
  seasonal_adjustment: z.string(),
  seasonal_adjustment_short: z.string(),
  last_updated: z.string(),
  popularity: z.number(),
  notes: z.string(),
});

export const FredObservationSchema = z.object({
  realtime_start: z.string(),
  realtime_end: z.string(),
  date: z.string(),
  value: z.string(),
});

export const FredObservationsResponseSchema = z.object({
  realtime_start: z.string(),
  realtime_end: z.string(),
  observation_start: z.string(),
  observation_end: z.string(),
  units: z.string(),
  output_type: z.number(),
  file_type: z.string(),
  order_by: z.string(),
  sort_order: z.string(),
  count: z.number(),
  offset: z.number(),
  limit: z.number(),
  observations: z.array(FredObservationSchema),
});

export const FredSeriesResponseSchema = z.object({
  seriess: z.array(FredSeriesSchema),
});
export type FredSeriesResponse = z.infer<
  typeof FredSeriesResponseSchema
>;

export type FredObservationsResponse = z.infer<
  typeof FredObservationsResponseSchema
>;

const apiLimit = process.env.FRED_API_LIMIT!;
const INITIAL_JOBLESS_CLAIMS_SERIES_ID = "ICSA";

export async function getInitialJoblessClaims() {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(INITIAL_JOBLESS_CLAIMS_SERIES_ID),
    fredObservations<FredObservationsResponse>(INITIAL_JOBLESS_CLAIMS_SERIES_ID, apiLimit, "m", "avg"),
  ]);
  const latest = observations.observations[0];
  const previous = observations.observations[1];
  if (!latest) throw new Error("FRED returned no initial jobless claims observations");
  if (!previous) throw new Error("FRED returned fewer than two initial jobless claims observations");
  return {
    indicator: "initial_jobless_claims", seriesId: INITIAL_JOBLESS_CLAIMS_SERIES_ID,
    current: {
      value: latest.value === null ? null : Number(Number(latest.value).toFixed(2)),
      previousValue: previous.value === null ? null : Number(Number(previous.value).toFixed(2)),
      change: latest.value === null || previous.value === null ? null : Number((Number(latest.value) - Number(previous.value)).toFixed(2)),
      unit: "persons", frequency: "weekly", observedAt: latest.date,
    },
    history: { frequency: "weekly", aggregation: "none", unit: "persons", observations: observations.observations.map((observation) => ({ date: observation.date, value: observation.value === null ? null : Number(Number(observation.value).toFixed(2)) })) },
    series: series.seriess[0],
  };
}
