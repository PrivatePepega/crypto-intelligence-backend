import {
  fredObservations,
  fredSeries,
} from "./fred.fetch.js";
import { z } from "zod";
import "dotenv/config";
import type { FredObservationsResponse, FredSeriesResponse } from "../../types/fred.types.js";


const apiLimit = process.env.FRED_API_LIMIT!;
const JOB_OPENINGS_SERIES_ID = "JTSJOL";

export async function getJobOpenings() {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(JOB_OPENINGS_SERIES_ID),
    fredObservations<FredObservationsResponse>(JOB_OPENINGS_SERIES_ID, apiLimit),
  ]);
  const latest = observations.observations[0];
  const previous = observations.observations[1];
  if (!latest) throw new Error("FRED returned no job openings observations");
  if (!previous) throw new Error("FRED returned fewer than two job openings observations");
  return {
    indicator: "job_openings", seriesId: JOB_OPENINGS_SERIES_ID,
    current: {
      value: latest.value === null ? null : Number(Number(latest.value).toFixed(2)),
      previousValue: previous.value === null ? null : Number(Number(previous.value).toFixed(2)),
      change: latest.value === null || previous.value === null ? null : Number((Number(latest.value) - Number(previous.value)).toFixed(2)),
      unit: "thousands_of_job_openings", frequency: "monthly", observedAt: latest.date,
    },
    history: {
      frequency: "monthly", aggregation: "none", unit: "thousands_of_job_openings",
      observations: observations.observations.map((observation) => ({ date: observation.date, value: observation.value === null ? null : Number(Number(observation.value).toFixed(2)) })),
    },
    series: series.seriess[0],
  };
}
