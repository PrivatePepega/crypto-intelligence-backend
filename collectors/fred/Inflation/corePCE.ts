import "dotenv/config";

import {
  fredObservations,
  fredSeries,
} from "../fred.fetch.js";

import type {
  FredObservationsResponse,
  FredSeriesResponse,
} from "../../../types/fred/fred.types.js";

type FredDataMode = "full" | "latest";

const apiLimit = process.env.FRED_API_LIMIT!;

const CORE_PCE_SERIES_ID = "PCEPILFE";

export async function getCorePce(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(CORE_PCE_SERIES_ID),
    fredObservations<FredObservationsResponse>(
      CORE_PCE_SERIES_ID,
      apiLimit,
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no Core PCE series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no Core PCE observations",
    );
  }

  const parseValue = (value: string | null): number | null => {
    if (value === null || value === ".") {
      return null;
    }

    return Number(Number(value).toFixed(2));
  };

  const normalizedObservations = selectedObservations.map(
    (observation) => ({
      date: observation.date,
      value: parseValue(observation.value),
    }),
  );

  const historical =
    mode === "latest"
      ? normalizedObservations.find(
          (observation) => observation.value !== null,
        ) ?? null
      : null;

  return {
    indicator: "core_pce",
    seriesId: CORE_PCE_SERIES_ID,
    frequency: seriesData.frequency,
    aggregation: "none",
    unit: "billions_of_dollars",
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}