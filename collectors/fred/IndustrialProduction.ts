import "dotenv/config";
import { z } from "zod";

import {
  fredObservations,
  fredSeries,
} from "./fred.fetch.js";
import type { FredObservationsResponse, FredSeriesResponse } from "../../types/fred.types.js";


const apiLimit = process.env.FRED_API_LIMIT!;

const INDUSTRIAL_PRODUCTION_SERIES_ID = "INDPRO";

export async function getIndustrialProduction() {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(
      INDUSTRIAL_PRODUCTION_SERIES_ID,
    ),
    fredObservations<FredObservationsResponse>(
      INDUSTRIAL_PRODUCTION_SERIES_ID,
      apiLimit,
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no industrial production series data",
    );
  }

  const latest = observations.observations[0];
  const previous = observations.observations[1];

  if (!latest) {
    throw new Error(
      "FRED returned no industrial production observations",
    );
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two industrial production observations",
    );
  }

  const parseValue = (value: string | null) =>
    value === null
      ? null
      : Number(Number(value).toFixed(2));

  const latestValue = parseValue(latest.value);
  const previousValue = parseValue(previous.value);

  return {
    indicator: "industrial_production",
    seriesId: INDUSTRIAL_PRODUCTION_SERIES_ID,

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