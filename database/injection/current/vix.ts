import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

export const injectVixLatest = async (
  data: NormalizedIndicatorData,
) => {
  console.log("→ VIX current injection initialized");

  const currentObservation = data.observations.find(
    (observation) => observation.value !== null,
  );

  if (!currentObservation || currentObservation.value === null) {
    throw new Error("VIX latest observation is missing");
  }

  const currentValue = currentObservation.value;

  const previousObservation = data.observations.find(
    (observation) =>
      observation.date !== currentObservation.date &&
      observation.value !== null,
  );

  if (!previousObservation || previousObservation.value === null) {
    throw new Error("VIX previous daily observation is missing");
  }

  const previousDayValue = previousObservation.value;
  const netChange = currentValue - previousDayValue;

  const client = await pool.connect();

  try {
    const historicalResult = await client.query<{
      date: string;
      value: string;
    }>(
      `
        SELECT date, value
        FROM historical.vix
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 12
      `,
      [currentObservation.date],
    );

    const historicalValues = historicalResult.rows.map(
      (observation) => Number(observation.value),
    );

    if (historicalValues.length < 3) {
      throw new Error(
        `Not enough historical data for VIX moving averages. Found ${historicalValues.length} observations.`,
      );
    }

    const movingAverage3d =
      historicalValues
        .slice(0, 3)
        .reduce((sum, value) => sum + value, 0) / 3;

    const movingAverage6d =
      historicalValues.length >= 6
        ? historicalValues
            .slice(0, 6)
            .reduce((sum, value) => sum + value, 0) / 6
        : null;

    const movingAverage12d =
      historicalValues.length >= 12
        ? historicalValues
            .slice(0, 12)
            .reduce((sum, value) => sum + value, 0) / 12
        : null;

    const currentVs3dMa = currentValue - movingAverage3d;

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
        INSERT INTO current.vix (
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
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
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

    console.log("✓ VIX current injection complete");

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
