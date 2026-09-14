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

const EXISTING_HOME_SALES_SERIES_ID = "EXHOSLUSM495S";

export async function getExistingHomeSales() {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(
      EXISTING_HOME_SALES_SERIES_ID,
    ),

    fredObservations<FredObservationsResponse>(
      EXISTING_HOME_SALES_SERIES_ID,
      apiLimit,
    ),
  ]);

  const latest = observations.observations[0];
  const previous = observations.observations[1];
  const seriesData = series.seriess[0];

  if (!latest) {
    throw new Error(
      "FRED returned no existing home sales observations",
    );
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two existing home sales observations",
    );
  }

  if (!seriesData) {
    throw new Error(
      "FRED returned no existing home sales series data",
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
    indicator: "existing_home_sales",
    seriesId: EXISTING_HOME_SALES_SERIES_ID,

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
      frequency: seriesData.frequency,
      aggregation: "none",
      unit: seriesData.units,
      observations: observations.observations.map(
        (observation) => ({
          date: observation.date,
          value: parseValue(observation.value),
        }),
      ),
    },

    series: seriesData,
  };
}