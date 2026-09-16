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

const INITIAL_JOBLESS_CLAIMS_SERIES_ID = "ICSA";

export async function getInitialJoblessClaims(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(
      INITIAL_JOBLESS_CLAIMS_SERIES_ID,
    ),
    fredObservations<FredObservationsResponse>(
      INITIAL_JOBLESS_CLAIMS_SERIES_ID,
      apiLimit,
      ...(mode === "full" ? ["m", "avg"] : []),
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no initial jobless claims series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no initial jobless claims observations",
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

  let historical = null;

  if (mode === "latest") {
    const monthlyObservations =
      await fredObservations<FredObservationsResponse>(
        INITIAL_JOBLESS_CLAIMS_SERIES_ID,
        apiLimit,
        "m",
        "avg",
      );

    const latestCompletedMonthlyObservation =
      monthlyObservations.observations.find(
        (observation) =>
          parseValue(observation.value) !== null,
      );

    historical = latestCompletedMonthlyObservation
      ? {
          date: latestCompletedMonthlyObservation.date,
          value: parseValue(
            latestCompletedMonthlyObservation.value,
          ),
        }
      : null;
  }

  return {
    indicator: "initial_jobless_claims",
    seriesId: INITIAL_JOBLESS_CLAIMS_SERIES_ID,
    frequency:
      mode === "latest"
        ? seriesData.frequency
        : "monthly",
    aggregation: "average",
    unit: seriesData.units,
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}