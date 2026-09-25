import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

export const injectDowJonesLatest = async (
  data: NormalizedIndicatorData,
) => {
  console.log("→ Dow Jones current injection initialized");

  const client = await pool.connect();

  try {
    const currentObservation = data.observations.find(
      (observation) => observation.value !== null,
    );

    if (!currentObservation) {
      throw new Error(
        "Dow Jones current observation is missing",
      );
    }

    const previousObservation = data.observations.find(
      (observation) =>
        observation.value !== null &&
        observation.date !== currentObservation.date,
    );

    if (!previousObservation) {
      throw new Error(
        "Dow Jones previous daily observation is missing",
      );
    }

    const currentValue = currentObservation.value!;
    const previousDayValue = previousObservation.value!;

    const netChange = currentValue - previousDayValue;

    const historicalResult = await client.query<{
      date: string;
      value: number;
    }>(
      `
        SELECT date, value
        FROM historical.dow_jones
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

    const movingAverage3d = calculateMovingAverage(
      historicalValues,
      3,
    );

    const movingAverage6d = calculateMovingAverage(
      historicalValues,
      6,
    );

    const movingAverage12d = calculateMovingAverage(
      historicalValues,
      12,
    );

    const currentVs3dMa =
      movingAverage3d !== null
        ? currentValue - movingAverage3d
        : null;

    const currentVs6dMa =
      movingAverage6d !== null
        ? currentValue - movingAverage6d
        : null;

    const currentVs12dMa =
      movingAverage12d !== null
        ? currentValue - movingAverage12d
        : null;

    await client.query(
      `
        INSERT INTO current.dow_jones (
          indicator,
          series_id,

          current_value,
          previous_day_value,

          net_change,

          moving_average_3d,
          current_vs_3d_ma,

          moving_average_6d,
          current_vs_6d_ma,

          moving_average_12d,
          current_vs_12d_ma,

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
          previous_day_value = EXCLUDED.previous_day_value,

          net_change = EXCLUDED.net_change,

          moving_average_3d = EXCLUDED.moving_average_3d,
          current_vs_3d_ma = EXCLUDED.current_vs_3d_ma,

          moving_average_6d = EXCLUDED.moving_average_6d,
          current_vs_6d_ma = EXCLUDED.current_vs_6d_ma,

          moving_average_12d = EXCLUDED.moving_average_12d,
          current_vs_12d_ma = EXCLUDED.current_vs_12d_ma,

          observed_at = EXCLUDED.observed_at,

          updated_at = NOW()
      `,
      [
        data.indicator,
        data.seriesId,

        currentValue,
        previousDayValue,

        netChange,

        movingAverage3d,
        currentVs3dMa,

        movingAverage6d,
        currentVs6dMa,

        movingAverage12d,
        currentVs12dMa,

        currentObservation.date,
      ],
    );

    console.log("✓ Dow Jones current injection complete");

    return {
      indicator: data.indicator,
      seriesId: data.seriesId,
      currentValue,
      previousDayValue,
      netChange,
      movingAverage3d,
      currentVs3dMa,
      movingAverage6d,
      currentVs6dMa,
      movingAverage12d,
      currentVs12dMa,
      observedAt: currentObservation.date,
    };
  } finally {
    client.release();
  }
};
