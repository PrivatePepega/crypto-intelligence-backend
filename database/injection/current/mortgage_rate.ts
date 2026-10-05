import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

export const injectMortgageRateLatest = async (
  data: NormalizedIndicatorData,
) => {
  console.log("→ Mortgage Rate current injection initialized");

  const client = await pool.connect();

  try {
    const currentObservation = data.observations.find(
      (observation) => observation.value !== null,
    );

    if (!currentObservation) {
      throw new Error(
        "Mortgage Rate current observation is missing",
      );
    }

    const previousObservation = data.observations.find(
      (observation) =>
        observation.value !== null &&
        observation.date !== currentObservation.date,
    );

    if (!previousObservation) {
      throw new Error(
        "Mortgage Rate previous weekly observation is missing",
      );
    }

    const currentValue = currentObservation.value!;
    const previousWeekValue = previousObservation.value!;

    const netChange = currentValue - previousWeekValue;

    const historicalResult = await client.query<{
      date: string;
      value: number;
    }>(
      `
        SELECT date, value
        FROM historical.mortgage_rate
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 12
      `,
      [currentObservation.date],
    );

    const historicalValues = historicalResult.rows.map(
      (row) => Number(row.value),
    );

    const calculateMovingAverage = (
      values: number[],
      period: number,
    ): number | null => {
      if (values.length < period) return null;

      const periodValues = values.slice(0, period);

      return (
        periodValues.reduce(
          (sum, value) => sum + value,
          0,
        ) / period
      );
    };

    const movingAverage30d = calculateMovingAverage(
      historicalValues,
      3,
    );

    const currentVs30dMa =
      movingAverage30d !== null
        ? currentValue - movingAverage30d
        : null;

    await client.query(
      `
        INSERT INTO current.mortgage_rate (
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

    console.log("✓ Mortgage Rate current injection complete");

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
