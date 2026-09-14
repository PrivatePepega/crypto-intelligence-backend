import { fredObservations, fredSeries } from "../../collectors/fred/fred.fetch.js";
import { z } from "zod";
import "dotenv/config";
import type { FredObservationsResponse, FredSeriesResponse } from "../../types/fred.types.js";


const apiLimit = process.env.FRED_API_LIMIT!;
const REAL_GDP_SERIES_ID = "GDPC1";

export async function getRealGdp() {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(REAL_GDP_SERIES_ID),
    fredObservations<FredObservationsResponse>(REAL_GDP_SERIES_ID, apiLimit),
  ]);
  const latest = observations.observations[0];
  const previous = observations.observations[1];
  if (!latest) throw new Error("FRED returned no real GDP observations");
  if (!previous) throw new Error("FRED returned fewer than two real GDP observations");
  return {
    indicator: "real_gdp", seriesId: REAL_GDP_SERIES_ID,
    current: {
      value: latest.value === null ? null : Number(Number(latest.value).toFixed(2)),
      previousValue: previous.value === null ? null : Number(Number(previous.value).toFixed(2)),
      change: latest.value === null || previous.value === null ? null : Number((Number(latest.value) - Number(previous.value)).toFixed(2)),
      unit: "billions_of_chained_2017_dollars", frequency: "quarterly", observedAt: latest.date,
    },
    history: { frequency: "quarterly", aggregation: "none", unit: "billions_of_chained_2017_dollars", observations: observations.observations.map((observation) => ({ date: observation.date, value: observation.value === null ? null : Number(Number(observation.value).toFixed(2)) })) },
    series: series.seriess[0],
  };
}
