import pool from "../../config/database.js";
import {
  isIgObservationComplete,
  type IgMarketConfig,
  type IgSentimentData,
} from "./igSentiment.js";

export const injectIgHistorical = async (
  config: IgMarketConfig,
  data: IgSentimentData,
) => {
  console.log(`→ ${config.label} historical injection initialized`);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // The IG payload is one flat array covering every asset, so this market's
    // rows are selected by asset and every one of them is persisted.
    // Inserting only the first match would leave the table with a single row,
    // which in turn breaks the current injector's previous-day lookup and all
    // of its moving averages.
    const observations = data.data.filter(
      (item) => item.asset === config.asset,
    );

    if (observations.length === 0) {
      throw new Error(
        `No IG observations matched asset "${config.asset}"`,
      );
    }

    for (const observation of observations) {
      if (!isIgObservationComplete(observation)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.${config.table} (
            date,
            series_id,
            asset,
            long,
            short,
            net,
            source
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,
            asset = EXCLUDED.asset,
            long = EXCLUDED.long,
            short = EXCLUDED.short,
            net = EXCLUDED.net,
            source = EXCLUDED.source
        `,
        [
          observation.date,
          config.seriesId,
          observation.asset,
          observation.long,
          observation.short,
          observation.net,
          observation.source,
        ],
      );
    }

    await client.query("COMMIT");

    console.log(
      `✓ ${config.label} historical injection complete — ${observations.length} observations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
