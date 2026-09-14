import { fredObservations, fredSeries } from "../../collectors/fred/fred.fetch.js";
import { z } from "zod";

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

export type FredSeriesResponse = z.infer<typeof FredSeriesResponseSchema>;
export type FredObservationsResponse = z.infer<
  typeof FredObservationsResponseSchema
>;

const NONFARM_PAYROLLS_SERIES_ID = "PAYEMS";

export async function getNonfarmPayrolls() {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(NONFARM_PAYROLLS_SERIES_ID),
    fredObservations<FredObservationsResponse>(
      NONFARM_PAYROLLS_SERIES_ID,
      "36",
    ),
  ]);

  const latest = observations.observations[0];
  const previous = observations.observations[1];

  if (!latest) {
    throw new Error("FRED returned no nonfarm payroll observations");
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two nonfarm payroll observations",
    );
  }

  return {
    indicator: "nonfarm_payrolls",
    seriesId: NONFARM_PAYROLLS_SERIES_ID,

    current: {
      value:
        latest.value === null ? null : Number(Number(latest.value).toFixed(2)),
      previousValue:
        previous.value === null
          ? null
          : Number(Number(previous.value).toFixed(2)),
      change:
        latest.value === null || previous.value === null
          ? null
          : Number((Number(latest.value) - Number(previous.value)).toFixed(2)),
      unit: "thousands_of_persons",
      frequency: "monthly",
      observedAt: latest.date,
    },

    history: {
      frequency: "monthly",
      aggregation: "none",
      unit: "thousands_of_persons",
      observations: observations.observations.map((observation) => ({
        date: observation.date,
        value:
          observation.value === null
            ? null
            : Number(Number(observation.value).toFixed(2)),
      })),
    },

    series: series.seriess[0],
  };
}
