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

const TEN_YEAR_SERIES_ID = "DGS10";
const TWO_YEAR_SERIES_ID = "DGS2";

const parseValue = (value: string | null): number | null => {
  if (value === null || value === ".") {
    return null;
  }

  return Number(Number(value).toFixed(2));
};

export async function getTenTwoYearYieldSpread(
  mode: FredDataMode,
) {
  const [
    tenYearSeries,
    twoYearSeries,
    tenYearObservations,
    twoYearObservations,
  ] = await Promise.all([
    fredSeries<FredSeriesResponse>(TEN_YEAR_SERIES_ID),
    fredSeries<FredSeriesResponse>(TWO_YEAR_SERIES_ID),
    fredObservations<FredObservationsResponse>(
      TEN_YEAR_SERIES_ID,
      mode === "latest" ? "10" : apiLimit,
      ...(mode === "full" ? ["w", "avg"] : []),
    ),
    fredObservations<FredObservationsResponse>(
      TWO_YEAR_SERIES_ID,
      mode === "latest" ? "10" : apiLimit,
      ...(mode === "full" ? ["w", "avg"] : []),
    ),
  ]);

  const tenYearSeriesData = tenYearSeries.seriess[0];
  const twoYearSeriesData = twoYearSeries.seriess[0];

  if (!tenYearSeriesData || !twoYearSeriesData) {
    throw new Error(
      "FRED returned no Treasury yield series data",
    );
  }

  const selectedTenYearObservations =
    mode === "latest"
      ? tenYearObservations.observations.slice(0, 3)
      : tenYearObservations.observations;

  const selectedTwoYearObservations =
    mode === "latest"
      ? twoYearObservations.observations.slice(0, 3)
      : twoYearObservations.observations;

  if (
    selectedTenYearObservations.length === 0 ||
    selectedTwoYearObservations.length === 0
  ) {
    throw new Error(
      "FRED returned no Treasury yield observations",
    );
  }

  const twoYearMap = new Map(
    selectedTwoYearObservations.map((observation) => [
      observation.date,
      parseValue(observation.value),
    ]),
  );

  const normalizedObservations = selectedTenYearObservations
    .map((observation) => {
      const tenYearValue = parseValue(observation.value);
      const twoYearValue = twoYearMap.get(observation.date);

      if (tenYearValue === null || twoYearValue === null) {
        return {
          date: observation.date,
          value: null,
        };
      }

      if (twoYearValue === undefined) {
        return null;
      }

      return {
        date: observation.date,
        value: Number(
          (tenYearValue - twoYearValue).toFixed(2),
        ),
      };
    })
    .filter(
      (
        observation,
      ): observation is {
        date: string;
        value: number | null;
      } => observation !== null,
    );

  if (normalizedObservations.length === 0) {
    throw new Error(
      "FRED returned no valid Treasury yield spread observations",
    );
  }

  let historical = null;

  if (mode === "latest") {
    const [tenYearWeekly, twoYearWeekly] =
      await Promise.all([
        fredObservations<FredObservationsResponse>(
          TEN_YEAR_SERIES_ID,
          apiLimit,
          "w",
          "avg",
        ),
        fredObservations<FredObservationsResponse>(
          TWO_YEAR_SERIES_ID,
          apiLimit,
          "w",
          "avg",
        ),
      ]);

    const twoYearWeeklyMap = new Map(
      twoYearWeekly.observations.map((observation) => [
        observation.date,
        parseValue(observation.value),
      ]),
    );

    historical =
      tenYearWeekly.observations
        .map((observation) => {
          const tenYearValue = parseValue(observation.value);
          const twoYearValue = twoYearWeeklyMap.get(
            observation.date,
          );

          if (
            tenYearValue === null ||
            twoYearValue === null ||
            twoYearValue === undefined
          ) {
            return null;
          }

          return {
            date: observation.date,
            value: Number(
              (tenYearValue - twoYearValue).toFixed(2),
            ),
          };
        })
        .find((observation) => observation !== null) ?? null;
  }

  return {
    indicator: "ten_two_year_yield_spread",
    frequency:
      mode === "latest"
        ? tenYearSeriesData.frequency
        : "Weekly",
    aggregation: "average",
    unit: "percentage_points",
    observations: normalizedObservations,
    historical,
    series: {
      primary: tenYearSeriesData,
      secondary: twoYearSeriesData,
    },
  };
}