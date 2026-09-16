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

const RESERVE_BALANCES_SERIES_ID = "WRESBAL";

export async function getReserveBalances(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(
      RESERVE_BALANCES_SERIES_ID,
    ),
    fredObservations<FredObservationsResponse>(
      RESERVE_BALANCES_SERIES_ID,
      apiLimit,
      ...(mode === "full" ? ["m", "avg"] : []),
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no reserve balances series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no reserve balances observations",
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
        RESERVE_BALANCES_SERIES_ID,
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
    indicator: "reserve_balances",
    seriesId: RESERVE_BALANCES_SERIES_ID,
    frequency:
      mode === "latest"
        ? seriesData.frequency
        : "Monthly",
    aggregation: "average",
    unit: seriesData.units,
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}