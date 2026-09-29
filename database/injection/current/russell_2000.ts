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
        FROM historical.russell_2000
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
      movingAverage30d !== null ? currentClose - movingAverage30d : null;

    const currentVs6monthMa =
      movingAverage6month !== null ? currentClose - movingAverage6month : null;

    const currentVs12monthMa =
      movingAverage12month !== null ? currentClose - movingAverage12month : null;

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

          moving_average_30d,
          current_vs_30d_ma,

          moving_average_6month,
          current_vs_6month_ma,

          moving_average_12month,
          current_vs_12month_ma,

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

          moving_average_30d = EXCLUDED.moving_average_30d,
          current_vs_30d_ma = EXCLUDED.current_vs_30d_ma,

          moving_average_6month = EXCLUDED.moving_average_6month,
          current_vs_6month_ma = EXCLUDED.current_vs_6month_ma,

          moving_average_12month = EXCLUDED.moving_average_12month,
          current_vs_12month_ma = EXCLUDED.current_vs_12month_ma,

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

        movingAverage30d,
        currentVs30dMa,

        movingAverage6month,
        currentVs6monthMa,

        movingAverage12month,
        currentVs12monthMa,

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
