import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type BrentObservation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date" | "value"
> & {
  commodity: string;
  interval: string;
};

type BrentData = Pick<NormalizedIndicatorData, "indicator" | "seriesId"> & {
  observations: BrentObservation[];
};

export const injectBrentFull = async (data: BrentData) => {
  console.log("→ Brent historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const observation of data.observations) {
      if (
        observation.value === null ||
        !Number.isFinite(observation.value) ||
        observation.commodity !== "brent"
      ) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.brent (
            date,
            series_id,
            value,
            commodity,
            interval
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,
            value = EXCLUDED.value,
            commodity = EXCLUDED.commodity,
            interval = EXCLUDED.interval
        `,
        [
          observation.date,
          "BRENT",
          observation.value,
          observation.commodity,
          observation.interval,
        ],
      );
    }

    await client.query("COMMIT");

    console.log("✓ Brent historical injection complete");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
