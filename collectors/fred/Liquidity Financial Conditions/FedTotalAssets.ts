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

const FED_TOTAL_ASSETS_SERIES_ID = "WALCL";

export async function getFedTotalAssets() {
  const [series, currentObservations, historicalObservations] =
    await Promise.all([
      fredSeries<FredSeriesResponse>(
        FED_TOTAL_ASSETS_SERIES_ID,
      ),

      // Latest native weekly observations
      fredObservations<FredObservationsResponse>(
        FED_TOTAL_ASSETS_SERIES_ID,
        apiLimit,
      ),

      // Monthly average history
      fredObservations<FredObservationsResponse>(
        FED_TOTAL_ASSETS_SERIES_ID,
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
      "FRED returned no Fed total assets observations",
    );
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two Fed total assets observations",
    );
  }

  if (!seriesData) {
    throw new Error(
      "FRED returned no Fed total assets series data",
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
    indicator: "fed_total_assets",
    seriesId: FED_TOTAL_ASSETS_SERIES_ID,

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