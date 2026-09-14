import { fredObservations, fredSearch, fredSeries } from "../../collectors/fred/fred.fetch.js";
import { z } from "zod";
import "dotenv/config";
import type { FredObservationsResponse, FredSeriesResponse } from "../../types/fred.types.js";




const apiLimit = process.env.FRED_API_LIMIT!;
const LABOR_FORCE_PARTICIPATION_SERIES_ID = "CIVPART";

export async function getLaborForceParticipation() {
  const [series, observations] = await Promise.all([
    fredSeries<FredSeriesResponse>(LABOR_FORCE_PARTICIPATION_SERIES_ID),
    fredObservations<FredObservationsResponse>(LABOR_FORCE_PARTICIPATION_SERIES_ID, apiLimit),
  ]);

  const latest = observations.observations[0];
  const previous = observations.observations[1];

  if (!latest) {
    throw new Error(
      "FRED returned no labor force participation observations",
    );
  }

  if (!previous) {
    throw new Error(
      "FRED returned fewer than two labor force participation observations",
    );
  }

  return {
    indicator: "labor_force_participation",
    seriesId: LABOR_FORCE_PARTICIPATION_SERIES_ID,

    current: {
      value:
        latest.value === null
          ? null
          : Number(Number(latest.value).toFixed(2)),
      previousValue:
        previous.value === null
          ? null
          : Number(Number(previous.value).toFixed(2)),
      change:
        latest.value === null || previous.value === null
          ? null
          : Number(
              (
                Number(latest.value) -
                Number(previous.value)
              ).toFixed(2),
            ),
      unit: "percent",
      frequency: "monthly",
      observedAt: latest.date,
    },

    history: {
      frequency: "monthly",
      aggregation: "none",
      unit: "percent",
      observations: observations.observations.map(
        (observation) => ({
          date: observation.date,
          value:
            observation.value === null
              ? null
              : Number(Number(observation.value).toFixed(2)),
        }),
      ),
    },

    series: series.seriess[0],
  };
}
