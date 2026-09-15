import "dotenv/config";

import {
  fredObservations,
  fredSeries,
} from "../fred.fetch.js";

import type {
  FredObservationsResponse,
  FredSeriesResponse,
} from "../../../types/fred/fred.types.js";

const apiLimit = process.env.FRED_API_LIMIT!;

const MORTGAGE_RATE_SERIES_ID = "MORTGAGE30US";

export async function getMortgageRate() {
  const [series, currentObservations, historicalObservations] =
    await Promise.all([
      fredSeries<FredSeriesResponse>(
        MORTGAGE_RATE_SERIES_ID,
      ),

      // Latest native weekly observations
      fredObservations<FredObservationsResponse>(
        MORTGAGE_RATE_SERIES_ID,
        apiLimit,
      ),

      // Monthly average history
      fredObservations<FredObservationsResponse>(
        MORTGAGE_RATE_SERIES_ID,
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
      "FRED returned no mortgage rate observations",
    );
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two mortgage rate observations",
    );
  }

  if (!seriesData) {
    throw new Error(
      "FRED returned no mortgage rate series data",
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
    indicator: "mortgage_rate",
    seriesId: MORTGAGE_RATE_SERIES_ID,

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