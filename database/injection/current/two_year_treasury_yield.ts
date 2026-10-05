import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

export const injectTwoYearTreasuryYieldLatest = async (
  data: NormalizedIndicatorData,
) => {
  const currentObservation = data.observations.find(
    (observation) => observation.value !== null,
  );

  if (!currentObservation || currentObservation.value === null) {
    throw new Error(
      "Two-Year Treasury Yield latest observation is missing",
    );
  }

  const currentValue = currentObservation.value;

  const previousObservation = data.observations.find(
    (observation) =>
      observation.date !== currentObservation.date &&
      observation.value !== null,
  );

  if (!previousObservation || previousObservation.value === null) {
    throw new Error(
      "Two-Year Treasury Yield previous weekly observation is missing",
    );
  }

  const previousWeekValue = previousObservation.value;

  const netChange = currentValue - previousWeekValue;

  const client = await pool.connect();

  try {
    const historicalResult = await client.query<{
      date: string;
      value: string;
    }>(
      `
        SELECT date, value
        FROM historical.two_year_treasury_yield
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 12
      `,
      [currentObservation.date],
    );

    const historicalValues = historicalResult.rows.map(
      (observation) => Number(observation.value),
    );

    if (historicalValues.length < 4) {
      throw new Error(
        `Not enough historical data for Two-Year Treasury Yield moving averages. Found ${historicalValues.length} observations.`,
      );
    }

    const movingAverage30d =
      historicalValues
        .slice(0, 4)
        .reduce((sum, value) => sum + value, 0) / 4;

    const currentVs30dMa = currentValue - movingAverage30d;

    await client.query(
      `
        INSERT INTO current.two_year_treasury_yield (
          indicator,
          series_id,
          current_value,
          previous_week_value,
          net_change,
          moving_average_30d,
          current_vs_30d_ma,
          observed_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,

          current_value = EXCLUDED.current_value,
          previous_week_value = EXCLUDED.previous_week_value,
          net_change = EXCLUDED.net_change,

          moving_average_30d = EXCLUDED.moving_average_30d,
          current_vs_30d_ma = EXCLUDED.current_vs_30d_ma,



          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        data.indicator,
        data.seriesId,

        currentValue,
        previousWeekValue,
        netChange,

        movingAverage30d,
        currentVs30dMa,



        currentObservation.date,
      ],
    );

    return {
      indicator: data.indicator,
      seriesId: data.seriesId,

      currentValue,
      previousWeekValue,
      netChange,

      movingAverage30d,
      currentVs30dMa,



      observedAt: currentObservation.date,
    };
  } finally {
    client.release();
  }
};