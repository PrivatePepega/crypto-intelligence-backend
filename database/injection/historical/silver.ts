import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type SilverObservation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date" | "value"
> & {
  commodity: string;
  interval: string;
};

type SilverData = Pick<NormalizedIndicatorData, "indicator" | "seriesId"> & {
  observations: SilverObservation[];
};

export const injectSilverFull = async (data: SilverData) => {
  console.log("→ Silver historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const observation of data.observations) {
      if (
        observation.value === null ||
        !Number.isFinite(observation.value) ||
        observation.commodity !== "silver"
      ) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.silver (
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
          "SILVER",
          observation.value,
          observation.commodity,
          observation.interval,
        ],
      );
    }

    await client.query("COMMIT");

    console.log("✓ Silver historical injection complete");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
