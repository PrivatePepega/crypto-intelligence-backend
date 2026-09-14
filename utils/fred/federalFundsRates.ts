import { fredObservations, fredSearch, fredSeries } from "../../collectors/fred/fred.fetch.js";
import { z } from "zod";
import "dotenv/config";
import type { FredObservationsResponse, FredSeriesResponse } from "../../types/fred.types.js";


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




