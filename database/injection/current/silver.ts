import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type SilverObservation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date" | "value"
> & {
  commodity: string;
  interval: string;
};

type SilverData = Pick<NormalizedIndicatorData, "indicator" | "seriesId"> & {
  observations: SilverObservation[];
};

export const injectSilverLatest = async (data: SilverData) => {
  console.log("→ Silver current injection initialized");

  const client = await pool.connect();

  try {
    const silverObservations = data.observations.filter(
      (observation) =>
        observation.commodity === "silver" &&
        observation.value !== null &&
        Number.isFinite(observation.value),
    );

    const currentObservation = silverObservations[0];

    if (!currentObservation || currentObservation.value === null) {
      throw new Error("No valid Silver observations found");
    }

    const currentValue = currentObservation.value;

    const previousResult = await client.query<{
      date: string;
      value: string;
    }>(
      `
        SELECT date, value
        FROM historical.silver
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 1
      `,
      [currentObservation.date],
    );

    const previousObservation = previousResult.rows[0];

    if (!previousObservation) {
      throw new Error("No previous Silver observation found");
    }

    const previousDayValue = Number(previousObservation.value);

    if (!Number.isFinite(previousDayValue)) {
      throw new Error("Previous Silver value is invalid");
    }

    const netChange = currentValue - previousDayValue;

    const percentChange =
      previousDayValue !== 0
        ? (netChange / previousDayValue) * 100
        : 0;

    const movingAverageResult = await client.query<{
      moving_average_3d: string | null;
      moving_average_6d: string | null;
      moving_average_12d: string | null;
    }>(
      `
        SELECT
          AVG(value) FILTER (
            WHERE date >= $1::date - INTERVAL '2 days'
          ) AS moving_average_3d,

          AVG(value) FILTER (
            WHERE date >= $1::date - INTERVAL '5 days'
          ) AS moving_average_6d,

          AVG(value) FILTER (
            WHERE date >= $1::date - INTERVAL '11 days'
          ) AS moving_average_12d
        FROM historical.silver
        WHERE date < $1::date
      `,
      [currentObservation.date],
    );

    const row = movingAverageResult.rows[0];

    if (!row) {
      throw new Error("No Silver moving-average data found");
    }

    const movingAverage3d =
      row.moving_average_3d !== null
        ? Number(row.moving_average_3d)
        : null;

    const movingAverage6d =
      row.moving_average_6d !== null
        ? Number(row.moving_average_6d)
        : null;

    const movingAverage12d =
      row.moving_average_12d !== null
        ? Number(row.moving_average_12d)
        : null;

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
        INSERT INTO current.silver (
          indicator,
          series_id,

          current_value,
          previous_day_value,

          net_change,
          percent_change,

          moving_average_3d,
          current_vs_3d_ma,

          moving_average_6d,
          current_vs_6d_ma,

          moving_average_12d,
          current_vs_12d_ma,

          commodity,
          interval,

          observed_at
        )
        VALUES (
          $1, $2,
          $3, $4,
          $5, $6,
          $7, $8,
          $9, $10,
          $11, $12,
          $13, $14,
          $15
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,

          current_value = EXCLUDED.current_value,
          previous_day_value = EXCLUDED.previous_day_value,

          net_change = EXCLUDED.net_change,
          percent_change = EXCLUDED.percent_change,

          moving_average_3d = EXCLUDED.moving_average_3d,
          current_vs_3d_ma = EXCLUDED.current_vs_3d_ma,

          moving_average_6d = EXCLUDED.moving_average_6d,
          current_vs_6d_ma = EXCLUDED.current_vs_6d_ma,

          moving_average_12d = EXCLUDED.moving_average_12d,
          current_vs_12d_ma = EXCLUDED.current_vs_12d_ma,

          commodity = EXCLUDED.commodity,
          interval = EXCLUDED.interval,

          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        data.indicator,
        "SILVER",

        currentValue,
        previousDayValue,

        netChange,
        percentChange,

        movingAverage3d,
        currentVs3dMa,

        movingAverage6d,
        currentVs6dMa,

        movingAverage12d,
        currentVs12dMa,

        currentObservation.commodity,
        currentObservation.interval,

        currentObservation.date,
      ],
    );

    console.log("✓ Silver current injection complete");

    return {
      indicator: data.indicator,
      commodity: currentObservation.commodity,
      current: {
        value: currentValue,
        previousDayValue,
        netChange,
        percentChange,
        movingAverage3d,
        currentVs3dMa,
        movingAverage6d,
        currentVs6dMa,
        movingAverage12d,
        currentVs12dMa,
        observedAt: currentObservation.date,
      },
    };
  } finally {
    client.release();
  }
};
