import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

export const injectSp500Latest = async (
  data: NormalizedIndicatorData,
) => {
  console.log("→ S&P 500 current injection initialized");

  const client = await pool.connect();

  try {
    const currentObservation = data.observations.find(
      (observation) => observation.value !== null,
    );

    if (!currentObservation) {
      throw new Error(
        "S&P 500 current observation is missing",
      );
    }

    const previousObservation = data.observations.find(
      (observation) =>
        observation.value !== null &&
        observation.date !== currentObservation.date,
    );

    if (!previousObservation) {
      throw new Error(
        "S&P 500 previous daily observation is missing",
      );
    }

    const currentValue = currentObservation.value!;
    const previousDayValue = previousObservation.value!;

    const netChange = currentValue - previousDayValue;

    const movingAverageResult = await client.query<{
      moving_average_30d: string | null;
      moving_average_6month: string | null;
      moving_average_12month: string | null;
    }>(
      `
        SELECT
          AVG(value) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d,

          AVG(value) FILTER (
            WHERE date >= $1::date - INTERVAL '6 months'
          ) AS moving_average_6month,

          AVG(value) FILTER (
            WHERE date >= $1::date - INTERVAL '12 months'
          ) AS moving_average_12month
        FROM historical.sp500
        WHERE date < $1::date
      `,
      [currentObservation.date],
    );

    // AVG() over an empty window yields NULL, so a 6/12 month average stays
    // null until enough history has been collected instead of throwing.
    const movingAverageRow = movingAverageResult.rows[0];

    const movingAverage30d =
      movingAverageRow?.moving_average_30d != null
        ? Number(movingAverageRow.moving_average_30d)
        : null;

    const movingAverage6month =
      movingAverageRow?.moving_average_6month != null
        ? Number(movingAverageRow.moving_average_6month)
        : null;

    const movingAverage12month =
      movingAverageRow?.moving_average_12month != null
        ? Number(movingAverageRow.moving_average_12month)
        : null;

    const currentVs30dMa =
      movingAverage30d !== null ? currentValue - movingAverage30d : null;

    const currentVs6monthMa =
      movingAverage6month !== null ? currentValue - movingAverage6month : null;

    const currentVs12monthMa =
      movingAverage12month !== null ? currentValue - movingAverage12month : null;

    await client.query(
      `
        INSERT INTO current.sp500 (
          indicator,
          series_id,

          current_value,
          previous_day_value,

          net_change,

          moving_average_30d,
          current_vs_30d_ma,

          moving_average_6month,
          current_vs_6month_ma,

          moving_average_12month,
          current_vs_12month_ma,

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

          moving_average_30d = EXCLUDED.moving_average_30d,
          current_vs_30d_ma = EXCLUDED.current_vs_30d_ma,

          moving_average_6month = EXCLUDED.moving_average_6month,
          current_vs_6month_ma = EXCLUDED.current_vs_6month_ma,

          moving_average_12month = EXCLUDED.moving_average_12month,
          current_vs_12month_ma = EXCLUDED.current_vs_12month_ma,

          observed_at = EXCLUDED.observed_at,

          updated_at = NOW()
      `,
      [
        data.indicator,
        data.seriesId,

        currentValue,
        previousDayValue,

        netChange,

        movingAverage30d,
        currentVs30dMa,

        movingAverage6month,
        currentVs6monthMa,

        movingAverage12month,
        currentVs12monthMa,

        currentObservation.date,
      ],
    );

    console.log("✓ S&P 500 current injection complete");

    return {
      indicator: data.indicator,
      seriesId: data.seriesId,
      currentValue,
      previousDayValue,
      netChange,
      movingAverage30d,
      currentVs30dMa,
      movingAverage6month,
      currentVs6monthMa,
      movingAverage12month,
      currentVs12monthMa,
      observedAt: currentObservation.date,
    };
  } finally {
    client.release();
  }
};
