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

const SERIES_ID = "RTWEXBGS";
const INDICATOR = "real_broad_usd_index";

const apiLimit = process.env.FRED_API_LIMIT!;

const parseValue = (value: string | null): number | null => {
  if (value === null || value === ".") {
    return null;
  }

  return Number(Number(value).toFixed(2));
};

export async function getRealBroadUsdIndex(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(SERIES_ID),
    fredObservations<FredObservationsResponse>(
      SERIES_ID,
      apiLimit,
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no real broad USD index series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no real broad USD index observations",
    );
  }

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
    indicator: INDICATOR,
    seriesId: SERIES_ID,
    frequency: seriesData.frequency,
    aggregation: "none",
    unit: seriesData.units,
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}