import "dotenv/config";

import {
  fredObservations,
  fredSeries,
} from "../fred.fetch.js";

import type {
  FredObservationsResponse,
  FredSeriesResponse,
} from "../../../types/fred.types.js";

const apiLimit = process.env.FRED_API_LIMIT!;

const HIGH_YIELD_CREDIT_SPREAD_SERIES_ID =
  "BAMLH0A0HYM2";

export async function getHighYieldCreditSpread() {
  const [series, currentObservations, historicalObservations] =
    await Promise.all([
      fredSeries<FredSeriesResponse>(
        HIGH_YIELD_CREDIT_SPREAD_SERIES_ID,
      ),

      // Latest native daily observations
      fredObservations<FredObservationsResponse>(
        HIGH_YIELD_CREDIT_SPREAD_SERIES_ID,
        apiLimit,
      ),

      // Monthly average history
      fredObservations<FredObservationsResponse>(
        HIGH_YIELD_CREDIT_SPREAD_SERIES_ID,
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
      "FRED returned no high-yield credit spread observations",
    );
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two high-yield credit spread observations",
    );
  }

  if (!seriesData) {
    throw new Error(
      "FRED returned no high-yield credit spread series data",
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
    indicator: "high_yield_credit_spread",
    seriesId: HIGH_YIELD_CREDIT_SPREAD_SERIES_ID,

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