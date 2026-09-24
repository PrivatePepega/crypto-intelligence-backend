import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

export const injectCoreConsumerPriceIndexFull = async (
  data: NormalizedIndicatorData,
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const observation of data.observations) {
      if (observation.value === null) continue;

      await client.query(
        `
          INSERT INTO historical.core_consumer_price_index (
            date,
            value,
            series_id
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (date)
          DO UPDATE SET
            value = EXCLUDED.value,
            series_id = EXCLUDED.series_id
        `,
        [
          observation.date,
          observation.value,
          data.seriesId,
        ],
      );
    }

    await client.query("COMMIT");

    console.log(
      `✓ Injected ${data.observations.length} Core Consumer Price Index observations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};