import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type AudUsdObservation = Pick<
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

type AudUsdData = Pick<NormalizedIndicatorData, "indicator" | "seriesId"> & {
  observations: AudUsdObservation[];
};

export const injectAudUsdFull = async (data: AudUsdData) => {
  console.log("→ AUD/USD historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const observation of data.observations) {
      if (
        !Number.isFinite(observation.open) ||
        !Number.isFinite(observation.high) ||
        !Number.isFinite(observation.low) ||
        !Number.isFinite(observation.close)
      ) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.aud_usd (
            date,
            series_id,
            open,
            high,
            low,
            close,
            pair,
            interval,
            timing
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            pair = EXCLUDED.pair,
            interval = EXCLUDED.interval,
            timing = EXCLUDED.timing
        `,
        [
          observation.date,
          "AUDUSD",
          observation.open,
          observation.high,
          observation.low,
          observation.close,
          observation.pair,
          observation.interval,
          observation.timing,
        ],
      );
    }

    await client.query("COMMIT");

    console.log(
      `✓ AUD/USD historical injection complete — ${data.observations.length} observations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
