
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
const TEN_YEAR_SERIES_ID = "DGS10";
const TWO_YEAR_SERIES_ID = "DGS2";

export async function getTenTwoYearYieldSpread() {
  const [
    tenYearSeries,
    twoYearSeries,
    tenYearDaily,
    twoYearDaily,
    tenYearWeekly,
    twoYearWeekly,
  ] = await Promise.all([
    fredSeries<FredSeriesResponse>(TEN_YEAR_SERIES_ID),
    fredSeries<FredSeriesResponse>(TWO_YEAR_SERIES_ID),

    // Overview
    fredObservations<FredObservationsResponse>(TEN_YEAR_SERIES_ID, "10"),
    fredObservations<FredObservationsResponse>(TWO_YEAR_SERIES_ID, "10"),

    // Metrics
    fredObservations<FredObservationsResponse>(TEN_YEAR_SERIES_ID, apiLimit, "w", "avg"),
    fredObservations<FredObservationsResponse>(TWO_YEAR_SERIES_ID, apiLimit, "w", "avg"),
  ]);

  const latest10Y = tenYearDaily.observations[0];
  const previous10Y = tenYearDaily.observations[1];

  const latest2Y = twoYearDaily.observations[0];
  const previous2Y = twoYearDaily.observations[1];

  if (!latest10Y || !latest2Y) {
    throw new Error("FRED returned no current observations");
  }

  if (!previous10Y || !previous2Y) {
    throw new Error("FRED returned fewer than two observations");
  }

  const currentSpread =
    Number(latest10Y.value) - Number(latest2Y.value);

  const previousSpread =
    Number(previous10Y.value) - Number(previous2Y.value);

  const tenYearWeeklyMap = new Map(
    tenYearWeekly.observations.map((observation) => [
      observation.date,
      observation.value,
    ]),
  );

  const twoYearWeeklyMap = new Map(
    twoYearWeekly.observations.map((observation) => [
      observation.date,
      observation.value,
    ]),
  );

  const history = tenYearWeekly.observations
    .map((observation) => {
      const twoYearValue = twoYearWeeklyMap.get(observation.date);

      if (observation.value === null || twoYearValue === null) {
        return {
          date: observation.date,
          value: null,
        };
      }

      if (twoYearValue === undefined) {
        return null;
      }

      return {
        date: observation.date,
        value: Number(
          (
            Number(observation.value) -
            Number(twoYearValue)
          ).toFixed(2),
        ),
      };
    })
    .filter((observation) => observation !== null);

  return {
    indicator: "ten_two_year_yield_spread",

    current: {
      value: Number(currentSpread.toFixed(2)),
      previousValue: Number(previousSpread.toFixed(2)),
      change: Number(
        (currentSpread - previousSpread).toFixed(2),
      ),
      unit: "percentage_points",
      frequency: "daily",
      observedAt: latest10Y.date,
    },

    history: {
      frequency: "weekly",
      aggregation: "average",
      unit: "percentage_points",
      observations: history,
    },

    series: {
      primary: tenYearSeries.seriess[0],
      secondary: twoYearSeries.seriess[0],
    },
  };
}
