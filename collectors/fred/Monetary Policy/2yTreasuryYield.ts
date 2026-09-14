
import {
  fredObservations,
  fredSeries,
} from "../fred.fetch.js";
import { z } from "zod";
import "dotenv/config";
import type { FredObservationsResponse, FredSeriesResponse } from "../../../types/fred.types.js";




const apiLimit = process.env.FRED_API_LIMIT!

const TWO_YEAR_TREASURY_YIELD_SERIES_ID = "DGS2";

export async function getTwoYearTreasuryYield() {
    const [series, dailyObservations, weeklyObservations] =
      await Promise.all([
        fredSeries<FredSeriesResponse>(
          TWO_YEAR_TREASURY_YIELD_SERIES_ID,
        ),
  
        // Overview: current daily value + daily change
        fredObservations<FredObservationsResponse>(
          TWO_YEAR_TREASURY_YIELD_SERIES_ID,
          "10",
        ),
  
        // Metrics: weekly average history
        fredObservations<FredObservationsResponse>(
          TWO_YEAR_TREASURY_YIELD_SERIES_ID,
          apiLimit,
          "w",
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
      indicator: "two_year_treasury_yield",
      seriesId: TWO_YEAR_TREASURY_YIELD_SERIES_ID,
  
      current: {
        value: Number(latest.value),
        previousValue: Number(previous.value),
        change: Number(latest.value) - Number(previous.value),
        unit: "percent",
        frequency: "daily",
        observedAt: latest.date,
      },
  
      history: {
        frequency: "weekly",
        aggregation: "average",
        unit: "percent",
        observations: weeklyObservations.observations.map(
          (observation) => ({
            date: observation.date,
            value: Number(observation.value),
          }),
        ),
      },
  
      series: series.seriess[0],
    };
  }