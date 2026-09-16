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

const REAL_GDP_GROWTH_SERIES_ID = "A191RL1Q225SBEA";

export async function getRealGdpGrowth(
  mode: FredDataMode,
) {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(
      REAL_GDP_GROWTH_SERIES_ID,
    ),
    fredObservations<FredObservationsResponse>(
      REAL_GDP_GROWTH_SERIES_ID,
      apiLimit,
    ),
  ]);

  const seriesData = series.seriess[0];

  if (!seriesData) {
    throw new Error(
      "FRED returned no real GDP growth series data",
    );
  }

  const selectedObservations =
    mode === "latest"
      ? observations.observations.slice(0, 3)
      : observations.observations;

  if (selectedObservations.length === 0) {
    throw new Error(
      "FRED returned no real GDP growth observations",
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

  const historical =
    mode === "latest"
      ? normalizedObservations.find(
          (observation) => observation.value !== null,
        ) ?? null
      : null;

  return {
    indicator: "real_gdp_growth",
    seriesId: REAL_GDP_GROWTH_SERIES_ID,
    frequency: seriesData.frequency,
    aggregation: "none",
    unit: "percent_change_at_annual_rate",
    observations: normalizedObservations,
    historical,
    series: seriesData,
  };
}