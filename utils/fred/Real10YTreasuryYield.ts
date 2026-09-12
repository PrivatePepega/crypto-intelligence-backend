
import { fredObservations, fredSearch, fredSeries } from "../../collectors/fred/fred.fetch.js";
import { z } from "zod";



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




  export const FredSeriesResponseSchema = z.object({
    seriess: z.array(FredSeriesSchema),
  });
  export type FredSeriesResponse = z.infer<
    typeof FredSeriesResponseSchema
  >;

  export type FredObservationsResponse = z.infer<
  typeof FredObservationsResponseSchema
>;



const REAL_TEN_YEAR_TREASURY_YIELD_SERIES_ID = "DFII10";

export async function getRealTenYearTreasuryYield() {
  const [series, dailyObservations, monthlyObservations] =
    await Promise.all([
      fredSeries<FredSeriesResponse>(REAL_TEN_YEAR_TREASURY_YIELD_SERIES_ID),

      // Overview: current daily value + daily change
      fredObservations<FredObservationsResponse>(
        REAL_TEN_YEAR_TREASURY_YIELD_SERIES_ID,
        "10",
      ),

      // Metrics: monthly average history
      fredObservations<FredObservationsResponse>(
        REAL_TEN_YEAR_TREASURY_YIELD_SERIES_ID,
        "36",
        "m",
        "avg",
      ),
    ]);

  const latest = dailyObservations.observations[0];
  const previous = dailyObservations.observations[1];

  if (!latest) {
    throw new Error("FRED returned no daily observations");
  }

  if (!previous) {
    throw new Error("FRED returned fewer than two observations");
  }

  return {
    indicator: "real_ten_year_treasury_yield",
    seriesId: REAL_TEN_YEAR_TREASURY_YIELD_SERIES_ID,

    current: {
      value: Number(Number(latest.value).toFixed(2)),
      previousValue: Number(Number(previous.value).toFixed(2)),
      change: Number(
        (
          Number(latest.value) -
          Number(previous.value)
        ).toFixed(2),
      ),
      unit: "percent",
      frequency: "daily",
      observedAt: latest.date,
    },

    history: {
      frequency: "monthly",
      aggregation: "average",
      unit: "percent",
      observations: monthlyObservations.observations.map(
        (observation) => ({
          date: observation.date,
          value:
            observation.value === null
              ? null
              : Number(Number(observation.value).toFixed(2)),
        }),
      ),
    },

    series: series.seriess[0],
  };
}