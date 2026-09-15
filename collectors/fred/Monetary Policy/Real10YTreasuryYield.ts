
import {
  fredObservations,
  fredSeries,
} from "../fred.fetch.js";
import { z } from "zod";
import "dotenv/config";
import type { FredObservationsResponse, FredSeriesResponse } from "../../../types/fred/fred.types.js";



const apiLimit = process.env.FRED_API_LIMIT!;
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
