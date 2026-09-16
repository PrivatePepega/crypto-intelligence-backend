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

const LABOR_FORCE_PARTICIPATION_SERIES_ID = "CIVPART";

export async function getLaborForceParticipation(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(
      LABOR_FORCE_PARTICIPATION_SERIES_ID,
    ),
    fredObservations<FredObservationsResponse>(
      LABOR_FORCE_PARTICIPATION_SERIES_ID,
      apiLimit,
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no labor force participation series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no labor force participation observations",
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
    indicator: "labor_force_participation",
    seriesId: LABOR_FORCE_PARTICIPATION_SERIES_ID,
    frequency: seriesData.frequency,
    aggregation: "average",
    unit: "percent",
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}