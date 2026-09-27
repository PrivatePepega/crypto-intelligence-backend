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
};

const RUSSELL_2000_SERIES_ID = "^RUT";

const isObservationComplete = (observation: Russell2000Observation) =>
  Number.isFinite(observation.open) &&
  Number.isFinite(observation.close) &&
  Number.isFinite(observation.change) &&
  Number.isFinite(observation.changePercent);

export const injectRussell2000Full = async (data: Russell2000Data) => {
  console.log("→ Russell 2000 historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (data.observations.length === 0) {
      throw new Error("No Russell 2000 observations found");
    }

    for (const observation of data.observations) {
      // Every column is NOT NULL, so skip a malformed row rather than abort
      // the whole transaction.
      if (!isObservationComplete(observation)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.russell_2000 (
            date,
            series_id,
            symbol,
            open,
            close,
            change,
            change_percent
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,
            symbol = EXCLUDED.symbol,
            open = EXCLUDED.open,
            close = EXCLUDED.close,
            change = EXCLUDED.change,
            change_percent = EXCLUDED.change_percent
        `,
        [
          observation.date,
          RUSSELL_2000_SERIES_ID,
          observation.symbol,
          observation.open,
          observation.close,
          observation.change,
          observation.changePercent,
        ],
      );
    }

    await client.query("COMMIT");

    console.log(
      `✓ Russell 2000 historical injection complete — ${data.observations.length} observations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
