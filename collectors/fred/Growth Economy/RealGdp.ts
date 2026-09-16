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

const REAL_GDP_SERIES_ID = "GDPC1";

export async function getRealGdp(mode: FredDataMode) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(REAL_GDP_SERIES_ID),
    fredObservations<FredObservationsResponse>(
      REAL_GDP_SERIES_ID,
      apiLimit,
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no real GDP series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no real GDP observations",
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
    indicator: "real_gdp",
    seriesId: REAL_GDP_SERIES_ID,
    frequency: seriesData.frequency,
    aggregation: "average",
    unit: "billions_of_chained_2017_dollars",
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}