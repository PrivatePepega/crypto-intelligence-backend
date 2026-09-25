import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type UsdCadObservation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date"
> & {
  open: number;
  high: number;
  low: number;
  close: number;
  pair: string;
  interval: string;
  timing: string;
};

type UsdCadData = Pick<NormalizedIndicatorData, "indicator" | "seriesId"> & {
  observations: UsdCadObservation[];
};

export const injectUsdCadLatest = async (data: UsdCadData) => {
  console.log("→ USD/CAD current injection initialized");

  const client = await pool.connect();

  try {
    const currentObservation = data.observations.find(
      (observation) => Number.isFinite(observation.close),
    );

    if (!currentObservation) {
      throw new Error("No valid USD/CAD current observation found");
    }

    const currentClose = currentObservation.close;

    const previousResult = await client.query<{
      date: string;
      close: string;
    }>(
      `
        SELECT date, close
        FROM historical.usd_cad
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 1
      `,
      [currentObservation.date],
    );

    const previousObservation = previousResult.rows[0];

    if (!previousObservation) {
      throw new Error("No previous USD/CAD observation found");
    }

    const previousClose = Number(previousObservation.close);

    if (!Number.isFinite(previousClose)) {
      throw new Error("Previous USD/CAD close is invalid");
    }

    const netChange = currentClose - previousClose;

    const percentChange =
      previousClose !== 0
        ? (netChange / previousClose) * 100
        : 0;

    const dailyRange =
      currentObservation.high - currentObservation.low;

    const movingAverageResult = await client.query<{
      moving_average_3d: string | null;
      moving_average_6d: string | null;
      moving_average_12d: string | null;
    }>(
      `
        SELECT
          AVG(close) FILTER (
            WHERE date >= $1::date - INTERVAL '2 days'
          ) AS moving_average_3d,

          AVG(close) FILTER (
            WHERE date >= $1::date - INTERVAL '5 days'
          ) AS moving_average_6d,

          AVG(close) FILTER (
            WHERE date >= $1::date - INTERVAL '11 days'
          ) AS moving_average_12d
        FROM historical.usd_cad
        WHERE date < $1::date
      `,
      [currentObservation.date],
    );

    const row = movingAverageResult.rows[0];

    if (!row) {
      throw new Error("No USD/CAD moving-average data found");
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
        ? currentClose - movingAverage3d
        : null;

    const currentVs6dMa =
      movingAverage6d !== null
        ? currentClose - movingAverage6d
        : null;

    const currentVs12dMa =
      movingAverage12d !== null
        ? currentClose - movingAverage12d
        : null;

    await client.query(
      `
        INSERT INTO current.usd_cad (
          indicator,
          series_id,

          current_open,
          current_high,
          current_low,
          current_close,

          previous_close,
          net_change,
          percent_change,

          daily_range,

          moving_average_3d,
          current_vs_3d_ma,

          moving_average_6d,
          current_vs_6d_ma,

          moving_average_12d,
          current_vs_12d_ma,

          pair,
          interval,
          timing,

          observed_at
        )
        VALUES (
          $1, $2,
          $3, $4, $5, $6,
          $7, $8, $9,
          $10,
          $11, $12,
          $13, $14,
          $15, $16,
          $17, $18, $19,
          $20
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,

          current_open = EXCLUDED.current_open,
          current_high = EXCLUDED.current_high,
          current_low = EXCLUDED.current_low,
          current_close = EXCLUDED.current_close,

          previous_close = EXCLUDED.previous_close,
          net_change = EXCLUDED.net_change,
          percent_change = EXCLUDED.percent_change,

          daily_range = EXCLUDED.daily_range,

          moving_average_3d = EXCLUDED.moving_average_3d,
          current_vs_3d_ma = EXCLUDED.current_vs_3d_ma,

          moving_average_6d = EXCLUDED.moving_average_6d,
          current_vs_6d_ma = EXCLUDED.current_vs_6d_ma,

          moving_average_12d = EXCLUDED.moving_average_12d,
          current_vs_12d_ma = EXCLUDED.current_vs_12d_ma,

          pair = EXCLUDED.pair,
          interval = EXCLUDED.interval,
          timing = EXCLUDED.timing,

          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        data.indicator,
        "USDCAD",

        currentObservation.open,
        currentObservation.high,
        currentObservation.low,
        currentClose,

        previousClose,
        netChange,
        percentChange,

        dailyRange,

        movingAverage3d,
        currentVs3dMa,

        movingAverage6d,
        currentVs6dMa,

        movingAverage12d,
        currentVs12dMa,

        currentObservation.pair,
        currentObservation.interval,
        currentObservation.timing,

        currentObservation.date,
      ],
    );

    console.log("✓ USD/CAD current injection complete");

    return {
      indicator: data.indicator,
      pair: currentObservation.pair,
      current: {
        open: currentObservation.open,
        high: currentObservation.high,
        low: currentObservation.low,
        close: currentClose,
        previousClose,
        netChange,
        percentChange,
        dailyRange,
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
