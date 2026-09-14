import {
  fredObservations,
  fredSeries,
} from "./fred.fetch.js";

import "dotenv/config";

import type {
  FredObservationsResponse,
  FredSeriesResponse,
} from "../../types/fred.types.js";

const apiLimit = process.env.FRED_API_LIMIT!;

const INITIAL_JOBLESS_CLAIMS_SERIES_ID = "ICSA";

export async function getInitialJoblessClaims() {
  const [series, currentObservations, historicalObservations] =
    await Promise.all([
      fredSeries<FredSeriesResponse>(
        INITIAL_JOBLESS_CLAIMS_SERIES_ID,
      ),

      // Native weekly observations for current value/change
      fredObservations<FredObservationsResponse>(
        INITIAL_JOBLESS_CLAIMS_SERIES_ID,
        apiLimit,
      ),

      // Monthly average observations for history
      fredObservations<FredObservationsResponse>(
        INITIAL_JOBLESS_CLAIMS_SERIES_ID,
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
      "FRED returned no initial jobless claims observations",
    );
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two initial jobless claims observations",
    );
  }

  if (!seriesData) {
    throw new Error(
      "FRED returned no initial jobless claims series data",
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
    indicator: "initial_jobless_claims",
    seriesId: INITIAL_JOBLESS_CLAIMS_SERIES_ID,

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