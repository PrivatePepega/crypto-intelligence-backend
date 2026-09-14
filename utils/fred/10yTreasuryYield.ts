
import { fredObservations, fredSearch, fredSeries } from "../../collectors/fred/fred.fetch.js";
import { z } from "zod";
import "dotenv/config";


export const FredObservationSchema = z.object({
    date: z.string(),
    value: z.string(),
  });
  
  export const FredObservationsResponseSchema = z.object({
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


  export type FredObservationsResponse = z.infer<
    typeof FredObservationsResponseSchema
  >;
  
  
  export type FredSeriesResponse = z.infer<
    typeof FredSeriesResponseSchema
  >;



const apiLimit = process.env.FRED_API_LIMIT!;
const TEN_YEAR_TREASURY_YIELD_SERIES_ID = "DGS10";

export async function getTenYearTreasuryYield() {
  const [series, dailyObservations, weeklyObservations] =
    await Promise.all([
      fredSeries<FredSeriesResponse>(TEN_YEAR_TREASURY_YIELD_SERIES_ID),

      // Overview: current daily value + daily change
      fredObservations<FredObservationsResponse>(
        TEN_YEAR_TREASURY_YIELD_SERIES_ID,
        "10",
      ),

      // Metrics: weekly average history
      fredObservations<FredObservationsResponse>(
        TEN_YEAR_TREASURY_YIELD_SERIES_ID,
        apiLimit,
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
    throw new Error("FRED returned fewer than two daily observations");
  }

  return {
    indicator: "ten_year_treasury_yield",
    seriesId: TEN_YEAR_TREASURY_YIELD_SERIES_ID,

    current: {
      value: Number(latest.value),
      previousValue: Number(previous.value),
      change: Number(
        (Number(latest.value) - Number(previous.value)).toFixed(2),
      ),
      unit: "percent",
      frequency: "daily",
      observedAt: latest.date,
    },

    history: {
      frequency: "monthly",
      aggregation: "average",
      unit: "percent",
      observations: weeklyObservations.observations.map(
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
