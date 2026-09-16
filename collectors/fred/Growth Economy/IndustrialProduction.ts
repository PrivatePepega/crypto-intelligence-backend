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

const INDUSTRIAL_PRODUCTION_SERIES_ID = "INDPRO";

export async function getIndustrialProduction(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(
      INDUSTRIAL_PRODUCTION_SERIES_ID,
    ),
    fredObservations<FredObservationsResponse>(
      INDUSTRIAL_PRODUCTION_SERIES_ID,
      apiLimit,
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no industrial production series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no industrial production observations",
    );
  }

  const parseValue = (value: string | null) =>
    value === null
      ? null
      : Number(Number(value).toFixed(2));

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
    indicator: "industrial_production",
    seriesId: INDUSTRIAL_PRODUCTION_SERIES_ID,
    frequency: seriesData.frequency,
    aggregation: "average",
    unit: seriesData.units,
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}