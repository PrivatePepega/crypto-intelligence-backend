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

const NONFARM_PAYROLLS_SERIES_ID = "PAYEMS";

export async function getNonfarmPayrolls(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(NONFARM_PAYROLLS_SERIES_ID),
    fredObservations<FredObservationsResponse>(
      NONFARM_PAYROLLS_SERIES_ID,
      apiLimit,
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no nonfarm payroll series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no nonfarm payroll observations",
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
    indicator: "nonfarm_payrolls",
    seriesId: NONFARM_PAYROLLS_SERIES_ID,
    frequency: seriesData.frequency,
    aggregation: "average",
    unit: "thousands_of_persons",
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}