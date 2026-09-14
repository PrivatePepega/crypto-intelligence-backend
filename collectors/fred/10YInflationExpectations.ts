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

const TEN_YEAR_INFLATION_EXPECTATIONS_SERIES_ID =
  "T10YIE";

export async function getTenYearInflationExpectations() {
  const [series, currentObservations, historicalObservations] =
    await Promise.all([
      fredSeries<FredSeriesResponse>(
        TEN_YEAR_INFLATION_EXPECTATIONS_SERIES_ID,
      ),

      // Native daily observations for current value/change
      fredObservations<FredObservationsResponse>(
        TEN_YEAR_INFLATION_EXPECTATIONS_SERIES_ID,
        apiLimit,
      ),

      // Monthly average observations for history
      fredObservations<FredObservationsResponse>(
        TEN_YEAR_INFLATION_EXPECTATIONS_SERIES_ID,
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
      "FRED returned no 10Y inflation expectations observations",
    );
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two 10Y inflation expectations observations",
    );
  }

  if (!seriesData) {
    throw new Error(
      "FRED returned no 10Y inflation expectations series data",
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
    indicator: "ten_year_inflation_expectations",
    seriesId: TEN_YEAR_INFLATION_EXPECTATIONS_SERIES_ID,

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