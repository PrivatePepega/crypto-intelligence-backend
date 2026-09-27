import pool from "../../../config/database.js";

// The FMP Russell 2000 collector is not FRED-shaped: its observations carry
// OHLC fields rather than a single `value`, so NormalizedIndicatorData does
// not apply here.
type Russell2000Observation = {
  symbol: string;
  date: string;
  open: number;
  close: number;
  change: number;
  changePercent: number;
};

type Russell2000Data = {
  indicator: string;
  observations: Russell2000Observation[];
  // In "latest" mode the provider returns observations.at(-1) here, which is
  // the most recent trading day because the normalizer sorts ascending.
  historical: Russell2000Observation | null;
};

const RUSSELL_2000_SERIES_ID = "^RUT";

export const injectRussell2000Latest = async (data: Russell2000Data) => {
  console.log("→ Russell 2000 current injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const currentObservation = data.historical;

    if (!currentObservation) {
      throw new Error(
        "Russell 2000 current observation not found in response",
      );
    }

    if (
      !Number.isFinite(currentObservation.open) ||
      !Number.isFinite(currentObservation.close) ||
      !Number.isFinite(currentObservation.change) ||
      !Number.isFinite(currentObservation.changePercent)
    ) {
      throw new Error("Current Russell 2000 values are invalid");
    }

    const previousResult = await client.query<{
      date: string;
      close: string;
    }>(
      `
        SELECT date, close
        FROM historical.russell_2000
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 1
      `,
      [currentObservation.date],
    );

    const previousObservation = previousResult.rows[0];

    if (!previousObservation) {
      throw new Error("Previous Russell 2000 observation not found");
    }

    const currentOpen = currentObservation.open;
    const currentClose = currentObservation.close;
    const previousClose = Number(previousObservation.close);

    if (!Number.isFinite(previousClose)) {
      throw new Error("Previous Russell 2000 values are invalid");
    }

    const closeNetChange = currentClose - previousClose;

    const closePercentChange =
      previousClose === 0 ? 0 : (closeNetChange / previousClose) * 100;

    // ^RUT is trading-day data, so the moving averages are taken over the last
    // N prior observations rather than a calendar-day window: a 6-calendar-day
    // window spans only ~4 trading days once weekends are excluded.
    const historicalResult = await client.query<{
      date: string;
      close: string;
    }>(
      `
        SELECT date, close
        FROM historical.russell_2000
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 12
      `,
      [currentObservation.date],
    );

    const historicalCloses = historicalResult.rows
      .map((row) => Number(row.close))
      .filter((value) => Number.isFinite(value));

    const calculateMovingAverage = (
      values: number[],
      period: number,
    ): number | null => {
      if (values.length < period) return null;

      const periodValues = values.slice(0, period);

      return periodValues.reduce((sum, value) => sum + value, 0) / period;
    };

    const movingAverage3d = calculateMovingAverage(historicalCloses, 3);
    const movingAverage6d = calculateMovingAverage(historicalCloses, 6);
    const movingAverage12d = calculateMovingAverage(historicalCloses, 12);

    const currentVs3dMa =
      movingAverage3d !== null ? currentClose - movingAverage3d : null;

    const currentVs6dMa =
      movingAverage6d !== null ? currentClose - movingAverage6d : null;

    const currentVs12dMa =
      movingAverage12d !== null ? currentClose - movingAverage12d : null;

    await client.query(
      `
        INSERT INTO current.russell_2000 (
          indicator,
          series_id,

          current_open,
          current_close,
          current_change,
          current_change_percent,

          previous_day_close,

          close_net_change,
          close_percent_change,

          moving_average_3d,
          current_vs_3d_ma,

          moving_average_6d,
          current_vs_6d_ma,

          moving_average_12d,
          current_vs_12d_ma,

          symbol,

          observed_at
        )
        VALUES (
          $1, $2,

          $3, $4, $5, $6,

          $7,

          $8, $9,

          $10, $11,

          $12, $13,

          $14, $15,

          $16,

          $17
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,

          current_open = EXCLUDED.current_open,
          current_close = EXCLUDED.current_close,
          current_change = EXCLUDED.current_change,
          current_change_percent = EXCLUDED.current_change_percent,

          previous_day_close = EXCLUDED.previous_day_close,

          close_net_change = EXCLUDED.close_net_change,
          close_percent_change = EXCLUDED.close_percent_change,

          moving_average_3d = EXCLUDED.moving_average_3d,
          current_vs_3d_ma = EXCLUDED.current_vs_3d_ma,

          moving_average_6d = EXCLUDED.moving_average_6d,
          current_vs_6d_ma = EXCLUDED.current_vs_6d_ma,

          moving_average_12d = EXCLUDED.moving_average_12d,
          current_vs_12d_ma = EXCLUDED.current_vs_12d_ma,

          symbol = EXCLUDED.symbol,

          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        "russell_2000",
        RUSSELL_2000_SERIES_ID,

        currentOpen,
        currentClose,
        currentObservation.change,
        currentObservation.changePercent,

        previousClose,

        closeNetChange,
        closePercentChange,

        movingAverage3d,
        currentVs3dMa,

        movingAverage6d,
        currentVs6dMa,

        movingAverage12d,
        currentVs12dMa,

        currentObservation.symbol,

        currentObservation.date,
      ],
    );

    await client.query("COMMIT");

    console.log("✓ Russell 2000 current injection complete");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
