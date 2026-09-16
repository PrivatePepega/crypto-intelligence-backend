import {
  fredObservations,
  fredSeries,
} from "../fred.fetch.js";

import "dotenv/config";

import type {
  FredObservationsResponse,
  FredSeriesResponse,
} from "../../../types/fred/fred.types.js";

type FredDataMode = "full" | "latest";

const apiLimit = process.env.FRED_API_LIMIT!;

const JOB_OPENINGS_SERIES_ID = "JTSJOL";

export async function getJobOpenings(mode: FredDataMode) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(JOB_OPENINGS_SERIES_ID),
    fredObservations<FredObservationsResponse>(
      JOB_OPENINGS_SERIES_ID,
      apiLimit,
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no job openings series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no job openings observations",
    );
  }

  const normalizedObservations = selectedObservations.map(
    (observation) => ({
      date: observation.date,
      value:
        observation.value === null
          ? null
          : Number(Number(observation.value).toFixed(2)),
    }),
  );

  const historical =
    mode === "latest"
      ? normalizedObservations.find(
          (observation) => observation.value !== null,
        ) ?? null
      : null;

  return {
    indicator: "job_openings",
    seriesId: JOB_OPENINGS_SERIES_ID,
    frequency: seriesData.frequency,
    aggregation: "average",
    unit: "thousands_of_job_openings",
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}