
import {
  fredObservations,
  fredSeries,
} from "../fred.fetch.js";
import { z } from "zod";
import "dotenv/config";


import type { FredObservationsResponse, FredSeriesResponse } from "../../../types/fred/fred.types.js";




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
