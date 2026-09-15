import {
  fredObservations,
  fredSeries,
} from "../fred.fetch.js";
import { z } from "zod";
import "dotenv/config";
import type { FredObservationsResponse, FredSeriesResponse } from "../../../types/fred/fred.types.js";


const apiLimit = process.env.FRED_API_LIMIT!;
const REAL_GDP_GROWTH_SERIES_ID = "A191RL1Q225SBEA";

export async function getRealGdpGrowth() {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(REAL_GDP_GROWTH_SERIES_ID),
    fredObservations<FredObservationsResponse>(REAL_GDP_GROWTH_SERIES_ID, apiLimit),
  ]);
  const latest = observations.observations[0];
  const previous = observations.observations[1];
  if (!latest) throw new Error("FRED returned no real GDP growth observations");
  if (!previous) throw new Error("FRED returned fewer than two real GDP growth observations");
  return {
    indicator: "real_gdp_growth", seriesId: REAL_GDP_GROWTH_SERIES_ID,
    current: {
      value: latest.value === null ? null : Number(Number(latest.value).toFixed(2)),
      previousValue: previous.value === null ? null : Number(Number(previous.value).toFixed(2)),
      change: latest.value === null || previous.value === null ? null : Number((Number(latest.value) - Number(previous.value)).toFixed(2)),
      unit: "percent_change_at_annual_rate", frequency: "quarterly", observedAt: latest.date,
    },
    history: { frequency: "quarterly", aggregation: "none", unit: "percent_change_at_annual_rate", observations: observations.observations.map((observation) => ({ date: observation.date, value: observation.value === null ? null : Number(Number(observation.value).toFixed(2)) })) },
    series: series.seriess[0],
  };
}
