
import { fredObservations, fredSearch, fredSeries } from "../../collectors/fred/fred.fetch.js";
import { z } from "zod";
import "dotenv/config";
import type { FredObservationsResponse, FredSeriesResponse } from "../../types/fred.types.js";



const apiLimit = process.env.FRED_API_LIMIT!;
const TEN_YEAR_BREAKEVEN_INFLATION_SERIES_ID = "T10YIE";

export async function getTenYearBreakevenInflation() {
  const [series, dailyObservations, weeklyObservations] =
    await Promise.all([
      fredSeries<FredSeriesResponse>(TEN_YEAR_BREAKEVEN_INFLATION_SERIES_ID),

      // Overview: current daily value + daily change
      fredObservations<FredObservationsResponse>(
        TEN_YEAR_BREAKEVEN_INFLATION_SERIES_ID,
        "10",
      ),

      // Metrics: weekly average history
      fredObservations<FredObservationsResponse>(
        TEN_YEAR_BREAKEVEN_INFLATION_SERIES_ID,
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
    indicator: "ten_year_breakeven_inflation",
    seriesId: TEN_YEAR_BREAKEVEN_INFLATION_SERIES_ID,

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
