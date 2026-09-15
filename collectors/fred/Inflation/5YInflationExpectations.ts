import {
  fredObservations,
  fredSeries,
} from "../fred.fetch.js";

import "dotenv/config";

import type {
  FredObservationsResponse,
  FredSeriesResponse,
} from "../../../types/fred/fred.types.js";

const apiLimit = process.env.FRED_API_LIMIT!;

const FIVE_YEAR_INFLATION_EXPECTATIONS_SERIES_ID =
  "T5YIE";

export async function getFiveYearInflationExpectations() {
  const [series, currentObservations, historicalObservations] =
    await Promise.all([
      fredSeries<FredSeriesResponse>(
        FIVE_YEAR_INFLATION_EXPECTATIONS_SERIES_ID,
      ),

      // Native daily observations for current value/change
      fredObservations<FredObservationsResponse>(
        FIVE_YEAR_INFLATION_EXPECTATIONS_SERIES_ID,
        apiLimit,
      ),

      // Monthly average observations for history
      fredObservations<FredObservationsResponse>(
        FIVE_YEAR_INFLATION_EXPECTATIONS_SERIES_ID,
        apiLimit,
        "m",
        "avg",
      ),
    ]);

  const latest = currentObservations.observations[0];
  const previous = currentObservations.observations[1];
  const seriesData = series.seriess[0];

  if (!latest) {
    throw new Error(
      "FRED returned no 5Y inflation expectations observations",
    );
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two 5Y inflation expectations observations",
    );
  }

  if (!seriesData) {
    throw new Error(
      "FRED returned no 5Y inflation expectations series data",
    );
  }

  const parseValue = (value: string | null): number | null => {
    if (value === null || value === ".") {
      return null;
    }

    return Number(Number(value).toFixed(2));
  };

  const latestValue = parseValue(latest.value);
  const previousValue = parseValue(previous.value);

  return {
    indicator: "five_year_inflation_expectations",
    seriesId: FIVE_YEAR_INFLATION_EXPECTATIONS_SERIES_ID,

    current: {
      value: latestValue,
      previousValue,
      change:
        latestValue === null || previousValue === null
          ? null
          : Number((latestValue - previousValue).toFixed(2)),
      unit: seriesData.units,
      frequency: seriesData.frequency,
      observedAt: latest.date,
    },

    history: {
      frequency: "Monthly",
      aggregation: "average",
      unit: seriesData.units,
      observations: historicalObservations.observations.map(
        (observation) => ({
          date: observation.date,
          value: parseValue(observation.value),
        }),
      ),
    },

    series: seriesData,
  };
}