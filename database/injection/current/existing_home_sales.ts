import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

export const injectExistingHomeSalesLatest = async (
  data: NormalizedIndicatorData,
) => {
  console.log("→ Existing Home Sales current injection initialized");

  const client = await pool.connect();

  try {
    const currentObservation = data.observations.find(
      (observation) => observation.value !== null,
    );

    if (!currentObservation) {
      throw new Error(
        "Existing Home Sales current observation is missing",
      );
    }

    const previousObservation = data.observations.find(
      (observation) =>
        observation.value !== null &&
        observation.date !== currentObservation.date,
    );

    if (!previousObservation) {
      throw new Error(
        "Existing Home Sales previous monthly observation is missing",
      );
    }

    const currentValue = currentObservation.value!;
    const previousMonthValue = previousObservation.value!;

    const netChange = currentValue - previousMonthValue;

    const historicalResult = await client.query<{
      date: string;
      value: number;
    }>(
      `
        SELECT date, value
        FROM historical.existing_home_sales
        WHERE date < DATE_TRUNC('month', $1::date)::date
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

    const movingAverage3m = calculateMovingAverage(
      historicalValues,
      3,
    );

    const movingAverage6m = calculateMovingAverage(
      historicalValues,
      6,
    );

    const movingAverage12m = calculateMovingAverage(
      historicalValues,
      12,
    );

    const currentVs3mMa =
      movingAverage3m !== null
        ? currentValue - movingAverage3m
        : null;

    const currentVs6mMa =
      movingAverage6m !== null
        ? currentValue - movingAverage6m
        : null;

    const currentVs12mMa =
      movingAverage12m !== null
        ? currentValue - movingAverage12m
        : null;

    await client.query(
      `
        INSERT INTO current.existing_home_sales (
          indicator,
          series_id,

          current_value,
          previous_month_value,

          net_change,

          moving_average_3m,
          current_vs_3m_ma,

          moving_average_6m,
          current_vs_6m_ma,

          moving_average_12m,
          current_vs_12m_ma,

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
          previous_month_value = EXCLUDED.previous_month_value,

          net_change = EXCLUDED.net_change,

          moving_average_3m = EXCLUDED.moving_average_3m,
          current_vs_3m_ma = EXCLUDED.current_vs_3m_ma,

          moving_average_6m = EXCLUDED.moving_average_6m,
          current_vs_6m_ma = EXCLUDED.current_vs_6m_ma,

          moving_average_12m = EXCLUDED.moving_average_12m,
          current_vs_12m_ma = EXCLUDED.current_vs_12m_ma,

          observed_at = EXCLUDED.observed_at,

          updated_at = NOW()
      `,
      [
        data.indicator,
        data.seriesId,

        currentValue,
        previousMonthValue,

        netChange,

        movingAverage3m,
        currentVs3mMa,

        movingAverage6m,
        currentVs6mMa,

        movingAverage12m,
        currentVs12mMa,

        currentObservation.date,
      ],
    );

    console.log("✓ Existing Home Sales current injection complete");

    return {
      indicator: data.indicator,
      seriesId: data.seriesId,
      currentValue,
      previousMonthValue,
      netChange,
      movingAverage3m,
      currentVs3mMa,
      movingAverage6m,
      currentVs6mMa,
      movingAverage12m,
      currentVs12mMa,
      observedAt: currentObservation.date,
    };
  } finally {
    client.release();
  }
};
