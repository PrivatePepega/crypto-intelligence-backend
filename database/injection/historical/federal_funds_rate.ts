import pool from "../../../config/database.js";
import type {NormalizedIndicatorData} from "../../../types/fred/fred.types.js"


export const injectFederalFundsRateFull = async (
  data: NormalizedIndicatorData,
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const observation of data.observations) {
      await client.query(
        `
          INSERT INTO historical.federal_funds_rate (
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
      `✓ Injected ${data.observations.length} Federal Funds Rate observations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};