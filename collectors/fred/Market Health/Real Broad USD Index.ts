import {
    fredObservations,
    fredSeries,
  } from "../fred.fetch.js";
  
  import type {
    FredObservationsResponse,
    FredSeriesResponse,
  } from "../../../types/fred/fred.types.js";
  
  const SERIES_ID = "RTWEXBGS";
  const INDICATOR = "real_broad_usd_index";
  
  const parseValue = (value: string | null): number | null => {
    if (value === null || value === ".") return null;
  
    return Number(Number(value).toFixed(2));
  };
  
  const apiLimit = process.env.FRED_API_LIMIT!;
  
  export async function getRealBroadUsdIndex() {
    const [series, observations] = await Promise.all([
      fredSeries<FredSeriesResponse>(SERIES_ID),
  
      // Native monthly observations
      fredObservations<FredObservationsResponse>(
        SERIES_ID,
        apiLimit,
      ),
    ]);
  
    const latest = observations.observations[0];
    const previous = observations.observations[1];
    const seriesData = series.seriess[0]!;
  
    const latestValue = parseValue(latest?.value ?? null);
    const previousValue = parseValue(previous?.value ?? null);
  
    return {
      indicator: INDICATOR,
      seriesId: SERIES_ID,
  
      current: {
        value: latestValue,
        previousValue,
        change:
          latestValue === null || previousValue === null
            ? null
            : Number((latestValue - previousValue).toFixed(2)),
        unit: seriesData.units,
        frequency: seriesData.frequency,
        observedAt: latest?.date ?? null,
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