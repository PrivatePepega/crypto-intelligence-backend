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

const TWO_YEAR_TREASURY_YIELD_SERIES_ID = "DGS2";

const parseValue = (value: string | null): number | null => {
  if (value === null || value === ".") {
    return null;
  }

  return Number(Number(value).toFixed(2));
};

export async function getTwoYearTreasuryYield(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(
      TWO_YEAR_TREASURY_YIELD_SERIES_ID,
    ),
    fredObservations<FredObservationsResponse>(
      TWO_YEAR_TREASURY_YIELD_SERIES_ID,
      mode === "latest" ? "10" : apiLimit,
      ...(mode === "full" ? ["w", "avg"] : []),
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no 2Y Treasury yield series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no 2Y Treasury yield observations",
    );
  }

  const normalizedObservations = selectedObservations.map(
    (observation) => ({
      date: observation.date,
      value: parseValue(observation.value),
    }),
  );

  let historical = null;

  if (mode === "latest") {
    const weeklyObservations =
      await fredObservations<FredObservationsResponse>(
        TWO_YEAR_TREASURY_YIELD_SERIES_ID,
        apiLimit,
        "w",
        "avg",
      );

    const latestCompletedWeeklyObservation =
      weeklyObservations.observations.find(
        (observation) =>
          parseValue(observation.value) !== null,
      );

    historical = latestCompletedWeeklyObservation
      ? {
          date: latestCompletedWeeklyObservation.date,
          value: parseValue(
            latestCompletedWeeklyObservation.value,
          ),
        }
      : null;
  }

  return {
    indicator: "two_year_treasury_yield",
    seriesId: TWO_YEAR_TREASURY_YIELD_SERIES_ID,
    frequency:
      mode === "latest"
        ? seriesData.frequency
        : "Weekly",
    aggregation: "average",
    unit: "percent",
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}