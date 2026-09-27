import pool from "../../../config/database.js";
import { isIgObservationComplete, type IgSentimentData } from "../igSentiment.js";

const IG_SP500_ASSET = "S&P 500";
const IG_SP500_SERIES_ID = "ig_sp500";

export const injectIgSp500Full = async (data: IgSentimentData) => {
  console.log("→ IG S&P 500 historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // The IG payload is one flat array covering every tracked asset, so the
    // S&P 500 rows are selected by asset and every one of them is persisted.
    // Inserting only the first match would leave the table with a single row,
    // which in turn breaks the current injector's previous-day lookup and all
    // of its moving averages.
    const observations = data.data.filter(
      (item) => item.asset === IG_SP500_ASSET,
    );

    if (observations.length === 0) {
      throw new Error(
        `No IG observations matched asset "${IG_SP500_ASSET}"`,
      );
    }

    for (const observation of observations) {
      if (!isIgObservationComplete(observation)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.sp500_ig_sentiment (
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
          IG_SP500_SERIES_ID,
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
      `✓ IG S&P 500 historical injection complete — ${observations.length} observations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
