import pool from "../../../config/database.js";
import type {NormalizedIndicatorData} from "../../../types/fred/fred.types.js"

export const injectFederalFundsRateLatest = async (
  data: NormalizedIndicatorData,
) => {
  const currentObservation = data.observations[0];

  if (!currentObservation || currentObservation.value === null) {
    throw new Error("Federal Funds Rate latest observation is missing");
  }

  if (!data.historical || data.historical.value === null) {
    throw new Error(
      "Federal Funds Rate previous monthly observation is missing",
    );
  }

  const currentValue = currentObservation.value;
  const previousMonthValue = data.historical.value;

  const netChange = currentValue - previousMonthValue;

  const client = await pool.connect();

  try {
    /*
     * Get completed monthly observations prior to the
     * current month. The current daily observation must
     * not participate in the moving averages.
     */
    const historicalResult = await client.query<{
      date: string;
      value: string;
    }>(
      `
        SELECT date, value
        FROM historical.federal_funds_rate
        WHERE date < DATE_TRUNC('month', $1::date)::date
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
        `Not enough historical data for Federal Funds Rate moving averages. Found ${historicalValues.length} observations.`,
      );
    }

    const movingAverage3m =
      historicalValues
        .slice(0, 3)
        .reduce((sum, value) => sum + value, 0) / 3;

    const movingAverage6m =
      historicalValues.length >= 6
        ? historicalValues
            .slice(0, 6)
            .reduce((sum, value) => sum + value, 0) / 6
        : null;

    const movingAverage12m =
      historicalValues.length >= 12
        ? historicalValues
            .slice(0, 12)
            .reduce((sum, value) => sum + value, 0) / 12
        : null;

    const currentVs3mMa = currentValue - movingAverage3m;

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
        INSERT INTO current.federal_funds_rate (
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