import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type NzdUsdObservation = Pick<
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

type NzdUsdData = Pick<NormalizedIndicatorData, "indicator" | "seriesId"> & {
  observations: NzdUsdObservation[];
};

export const injectNzdUsdLatest = async (data: NzdUsdData) => {
  console.log("→ NZD/USD current injection initialized");

  const client = await pool.connect();

  try {
    const currentObservation = data.observations.find(
      (observation) => Number.isFinite(observation.close),
    );

    if (!currentObservation) {
      throw new Error("No valid NZD/USD current observation found");
    }

    const currentClose = currentObservation.close;

    const previousResult = await client.query<{
      date: string;
      close: string;
    }>(
      `
        SELECT date, close
        FROM historical.nzd_usd
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 1
      `,
      [currentObservation.date],
    );

    const previousObservation = previousResult.rows[0];

    if (!previousObservation) {
      throw new Error("No previous NZD/USD observation found");
    }

    const previousClose = Number(previousObservation.close);

    if (!Number.isFinite(previousClose)) {
      throw new Error("Previous NZD/USD close is invalid");
    }

    const netChange = currentClose - previousClose;

    const percentChange =
      previousClose !== 0
        ? (netChange / previousClose) * 100
        : 0;

    const dailyRange =
      currentObservation.high - currentObservation.low;

    const movingAverageResult = await client.query<{
      moving_average_30d: string | null;
      moving_average_6month: string | null;
      moving_average_12month: string | null;
    }>(
      `
        SELECT
          AVG(close) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d,

          AVG(close) FILTER (
            WHERE date >= $1::date - INTERVAL '6 months'
          ) AS moving_average_6month,

          AVG(close) FILTER (
            WHERE date >= $1::date - INTERVAL '12 months'
          ) AS moving_average_12month
        FROM historical.nzd_usd
        WHERE date < $1::date
      `,
      [currentObservation.date],
    );

    const row = movingAverageResult.rows[0];

    if (!row) {
      throw new Error("No NZD/USD moving-average data found");
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
        ? currentClose - movingAverage30d
        : null;

    const currentVs6monthMa =
      movingAverage6month !== null
        ? currentClose - movingAverage6month
        : null;

    const currentVs12monthMa =
      movingAverage12month !== null
        ? currentClose - movingAverage12month
        : null;

    await client.query(
      `
        INSERT INTO current.nzd_usd (
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

          moving_average_30d,
          current_vs_30d_ma,

          moving_average_6month,
          current_vs_6month_ma,

          moving_average_12month,
          current_vs_12month_ma,

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

          moving_average_30d = EXCLUDED.moving_average_30d,
          current_vs_30d_ma = EXCLUDED.current_vs_30d_ma,

          moving_average_6month = EXCLUDED.moving_average_6month,
          current_vs_6month_ma = EXCLUDED.current_vs_6month_ma,

          moving_average_12month = EXCLUDED.moving_average_12month,
          current_vs_12month_ma = EXCLUDED.current_vs_12month_ma,

          pair = EXCLUDED.pair,
          interval = EXCLUDED.interval,
          timing = EXCLUDED.timing,

          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        data.indicator,
        "NZDUSD",

        currentObservation.open,
        currentObservation.high,
        currentObservation.low,
        currentClose,

        previousClose,
        netChange,
        percentChange,

        dailyRange,

        movingAverage30d,
        currentVs30dMa,

        movingAverage6month,
        currentVs6monthMa,

        movingAverage12month,
        currentVs12monthMa,

        currentObservation.pair,
        currentObservation.interval,
        currentObservation.timing,

        currentObservation.date,
      ],
    );

    console.log("✓ NZD/USD current injection complete");

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
        movingAverage30d,
        currentVs30dMa,
        movingAverage6month,
        currentVs6monthMa,
        movingAverage12month,
        currentVs12monthMa,
        observedAt: currentObservation.date,
      },
    };
  } finally {
    client.release();
  }
};
