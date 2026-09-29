import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type CnnFearGreedObservation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date" | "value"
> & {
  rating: string;
};

type CnnFearGreedData = Pick<NormalizedIndicatorData, "indicator"> & {
  observations: CnnFearGreedObservation[];
};

export const injectCnnFearGreedLatest = async (data: CnnFearGreedData) => {
  console.log("→ CNN Fear & Greed current injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const observations = data.observations.filter(
      (observation) =>
        observation.value !== null &&
        Number.isFinite(observation.value),
    );

    const currentObservation = observations[0];

    if (!currentObservation || currentObservation.value === null) {
      throw new Error("No valid CNN Fear & Greed observations found");
    }

    const currentValue = currentObservation.value;

    const previousResult = await client.query<{
      date: string;
      value: string;
      rating: string;
    }>(
      `
        SELECT date, value, rating
        FROM historical.cnn_fear_greed
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 1
      `,
      [currentObservation.date],
    );

    const previousObservation = previousResult.rows[0];

    if (!previousObservation) {
      throw new Error("No previous CNN Fear & Greed observation found");
    }

    const previousDayValue = Number(previousObservation.value);
    const previousDayRating = previousObservation.rating;

    if (!Number.isFinite(previousDayValue)) {
      throw new Error("Previous CNN Fear & Greed value is invalid");
    }

    const netChange = currentValue - previousDayValue;

    const percentChange =
      previousDayValue === 0
        ? 0
        : (netChange / previousDayValue) * 100;

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
        FROM historical.cnn_fear_greed
        WHERE date < $1::date
      `,
      [currentObservation.date],
    );

    const row = movingAverageResult.rows[0];

    if (!row) {
      throw new Error("No CNN Fear & Greed moving-average data found");
    }

    const movingAverage30d =
      row.moving_average_30d !== null
        ? Number(row.moving_average_30d)
        : null;

    const movingAverage6month =
      row.moving_average_6month !== null
        ? Number(row.moving_average_6month)
        : null;

    const movingAverage12month =
      row.moving_average_12month !== null
        ? Number(row.moving_average_12month)
        : null;

    const currentVs30dMa =
      movingAverage30d !== null
        ? currentValue - movingAverage30d
        : null;

    const currentVs6monthMa =
      movingAverage6month !== null
        ? currentValue - movingAverage6month
        : null;

    const currentVs12monthMa =
      movingAverage12month !== null
        ? currentValue - movingAverage12month
        : null;

    await client.query(
      `
        INSERT INTO current.cnn_fear_greed (
          indicator,
          series_id,
          current_value,
          current_rating,
          previous_day_value,
          previous_day_rating,
          net_change,
          percent_change,
          moving_average_30d,
          current_vs_30d_ma,
          moving_average_6month,
          current_vs_6month_ma,
          moving_average_12month,
          current_vs_12month_ma,
          observed_at
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10,
          $11, $12,
          $13, $14,
          $15
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,
          current_value = EXCLUDED.current_value,
          current_rating = EXCLUDED.current_rating,
          previous_day_value = EXCLUDED.previous_day_value,
          previous_day_rating = EXCLUDED.previous_day_rating,
          net_change = EXCLUDED.net_change,
          percent_change = EXCLUDED.percent_change,
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
        "cnn_fear_greed",
        "cnn_fear_greed",
        currentValue,
        currentObservation.rating,
        previousDayValue,
        previousDayRating,
        netChange,
        percentChange,
        movingAverage30d,
        currentVs30dMa,
        movingAverage6month,
        currentVs6monthMa,
        movingAverage12month,
        currentVs12monthMa,
        currentObservation.date,
      ],
    );

    await client.query("COMMIT");

    console.log("✓ CNN Fear & Greed current injection complete");

    return {
      indicator: "cnn_fear_greed",
      seriesId: "cnn_fear_greed",

      currentValue,
      currentRating: currentObservation.rating,

      previousDayValue,
      previousDayRating,

      netChange,
      percentChange,

      movingAverage30d,
      currentVs30dMa,

      movingAverage6month,
      currentVs6monthMa,

      movingAverage12month,
      currentVs12monthMa,

      observedAt: currentObservation.date,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
