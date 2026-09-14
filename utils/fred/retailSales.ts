import "dotenv/config";

import {
  fredObservations,
  fredSeries,
} from "../../collectors/fred/fred.fetch.js";
import type {
  FredObservationsResponse,
  FredSeriesResponse,
} from "../../types/fred.types.js";

const apiLimit = process.env.FRED_API_LIMIT!;

const RETAIL_SALES_SERIES_ID = "RSAFS";

export async function getRetailSales() {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(RETAIL_SALES_SERIES_ID),
    fredObservations<FredObservationsResponse>(
      RETAIL_SALES_SERIES_ID,
      apiLimit,
    ),
  ]);

  const latest = observations.observations[0];
  const previous = observations.observations[1];
  const seriesData = series.seriess[0];

  if (!latest) {
    throw new Error(
      "FRED returned no retail sales observations",
    );
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two retail sales observations",
    );
  }

  if (!seriesData) {
    throw new Error(
      "FRED returned no retail sales series data",
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
    indicator: "retail_sales",
    seriesId: RETAIL_SALES_SERIES_ID,

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