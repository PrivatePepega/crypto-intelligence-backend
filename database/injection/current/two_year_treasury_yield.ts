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

    if (historicalValues.length < 3) {
      throw new Error(
        `Not enough historical data for Two-Year Treasury Yield moving averages. Found ${historicalValues.length} observations.`,
      );
    }

    const movingAverage3w =
      historicalValues
        .slice(0, 3)
        .reduce((sum, value) => sum + value, 0) / 3;

    const movingAverage6w =
      historicalValues.length >= 6
        ? historicalValues
            .slice(0, 6)
            .reduce((sum, value) => sum + value, 0) / 6
        : null;

    const movingAverage12w =
      historicalValues.length >= 12
        ? historicalValues
            .slice(0, 12)
            .reduce((sum, value) => sum + value, 0) / 12
        : null;

    const currentVs3wMa = currentValue - movingAverage3w;

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
        INSERT INTO current.two_year_treasury_yield (
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
          $1,
          $2,

          $3,
          $4,
          $5,

          $6,
          $7,

          $8,
          $9,

          $10,
          $11,

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