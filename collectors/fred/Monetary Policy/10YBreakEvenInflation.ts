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

const TEN_YEAR_BREAKEVEN_INFLATION_SERIES_ID = "T10YIE";

export async function getTenYearBreakevenInflation(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(
      TEN_YEAR_BREAKEVEN_INFLATION_SERIES_ID,
    ),
    fredObservations<FredObservationsResponse>(
      TEN_YEAR_BREAKEVEN_INFLATION_SERIES_ID,
      mode === "latest" ? "10" : apiLimit,
      ...(mode === "full" ? ["m", "avg"] : []),
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no ten-year breakeven inflation series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no ten-year breakeven inflation observations",
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
        TEN_YEAR_BREAKEVEN_INFLATION_SERIES_ID,
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
    indicator: "ten_year_breakeven_inflation",
    seriesId: TEN_YEAR_BREAKEVEN_INFLATION_SERIES_ID,
    frequency:
      mode === "latest"
        ? seriesData.frequency
        : "Monthly",
    aggregation: "average",
    unit: "percent",
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}