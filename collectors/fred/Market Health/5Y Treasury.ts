import {
    fredObservations,
    fredSeries,
  } from "../fred.fetch.js";
  
  import type {
    FredObservationsResponse,
    FredSeriesResponse,
  } from "../../../types/fred/fred.types.js";
  
  const SERIES_ID = "DGS5";
  const INDICATOR = "5y_treasury";
  
  const parseValue = (value: string | null): number | null => {
    if (value === null || value === ".") return null;
  
    return Number(Number(value).toFixed(2));
  };
  
  const apiLimit = process.env.FRED_API_LIMIT!;
  
  export async function get5yTreasury() {
    const [series, currentObservations, historicalObservations] =
      await Promise.all([
        fredSeries<FredSeriesResponse>(SERIES_ID),
  
        // Native daily observations for current value
        fredObservations<FredObservationsResponse>(
          SERIES_ID,
          "10",
        ),
  
        // Monthly average history
        fredObservations<FredObservationsResponse>(
          SERIES_ID,
          apiLimit,
          "m",
          "avg",
        ),
      ]);
  
    const latest = currentObservations.observations[0];
    const previous = currentObservations.observations[1];
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