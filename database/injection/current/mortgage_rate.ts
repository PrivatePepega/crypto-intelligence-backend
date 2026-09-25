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

    const movingAverage3w = calculateMovingAverage(
      historicalValues,
      3,
    );

    const movingAverage6w = calculateMovingAverage(
      historicalValues,
      6,
    );

    const movingAverage12w = calculateMovingAverage(
      historicalValues,
      12,
    );

    const currentVs3wMa =
      movingAverage3w !== null
        ? currentValue - movingAverage3w
        : null;

    const currentVs6wMa =
      movingAverage6w !== null
        ? currentValue - movingAverage6w
        : null;

    const currentVs12wMa =
      movingAverage12w !== null
        ? currentValue - movingAverage12w
        : null;

    await client.query(
      `
        INSERT INTO current.mortgage_rate (
          indicator,
          series_id,

          current_value,
          previous_week_value,

          net_change,

          moving_average_3w,
          current_vs_3w_ma,

          moving_average_6w,
          current_vs_6w_ma,

          moving_average_12w,
          current_vs_12w_ma,

          observed_at
        )
        VALUES (
          $1, $2,
          $3, $4,
          $5,
          $6, $7,
          $8, $9,
          $10, $11,
          $12
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,

          current_value = EXCLUDED.current_value,
          previous_week_value = EXCLUDED.previous_week_value,

          net_change = EXCLUDED.net_change,

          moving_average_3w = EXCLUDED.moving_average_3w,
          current_vs_3w_ma = EXCLUDED.current_vs_3w_ma,

          moving_average_6w = EXCLUDED.moving_average_6w,
          current_vs_6w_ma = EXCLUDED.current_vs_6w_ma,

          moving_average_12w = EXCLUDED.moving_average_12w,
          current_vs_12w_ma = EXCLUDED.current_vs_12w_ma,

          observed_at = EXCLUDED.observed_at,

          updated_at = NOW()
      `,
      [
        data.indicator,
        data.seriesId,

        currentValue,
        previousWeekValue,

        netChange,

        movingAverage3w,
        currentVs3wMa,

        movingAverage6w,
        currentVs6wMa,

        movingAverage12w,
        currentVs12wMa,

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
      movingAverage3w,
      currentVs3wMa,
      movingAverage6w,
      currentVs6wMa,
      movingAverage12w,
      currentVs12wMa,
      observedAt: currentObservation.date,
    };
  } finally {
    client.release();
  }
};
