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

export type FredObservationsResponse = z.infer<
  typeof FredObservationsResponseSchema
>;
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
  
export type FredSeriesResponse = z.infer<typeof FredSeriesResponseSchema>;


const apiLimit = process.env.FRED_API_LIMIT!;
const FEDERAL_FUNDS_RATE_SERIES_ID = "DFF";




export async function getFederalFundsRate() {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(FEDERAL_FUNDS_RATE_SERIES_ID),
    fredObservations<FredObservationsResponse>(FEDERAL_FUNDS_RATE_SERIES_ID, apiLimit, "m", "avg"),
  ]);

  const latest = observations.observations[0];
  const previous = observations.observations[1];

  if (!latest) {
    throw new Error("FRED returned no observations");
  }
  
  if (!previous) {
    throw new Error("FRED returned fewer than two observations");
  }


  return {
    indicator: "federal_funds_rate",
    seriesId: FEDERAL_FUNDS_RATE_SERIES_ID,

    value: Number(latest.value),
    previousValue: Number(previous.value),
    change: Number(latest.value) - Number(previous.value),

    unit: "percent",
    frequency: "daily",

    observedAt: latest.date,

    history: observations.observations.map((observation) => ({
      date: observation.date,
      value: Number(observation.value),
    })),

    series: series.seriess[0],
  };
}




