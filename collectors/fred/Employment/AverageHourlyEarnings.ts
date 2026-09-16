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

const AVERAGE_HOURLY_EARNINGS_SERIES_ID = "CES0500000003";

export async function getAverageHourlyEarnings(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(
      AVERAGE_HOURLY_EARNINGS_SERIES_ID,
    ),
    fredObservations<FredObservationsResponse>(
      AVERAGE_HOURLY_EARNINGS_SERIES_ID,
      apiLimit,
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no average hourly earnings series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no average hourly earnings observations",
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

  return {
    indicator: "average_hourly_earnings",
    seriesId: AVERAGE_HOURLY_EARNINGS_SERIES_ID,
    frequency: seriesData.frequency,
    aggregation: "average",
    unit: "dollars_per_hour",
    observations: normalizedObservations,
    historical:
      mode === "latest"
        ? normalizedObservations[0] ?? null
        : null,
    series: seriesData,
  };
}