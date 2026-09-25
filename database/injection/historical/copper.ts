import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type CopperObservation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date" | "value"
> & {
  commodity: string;
  interval: string;
};

type CopperData = Pick<NormalizedIndicatorData, "indicator" | "seriesId"> & {
  observations: CopperObservation[];
};

export const injectCopperFull = async (data: CopperData) => {
  console.log("→ Copper historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const observation of data.observations) {
      if (
        observation.value === null ||
        !Number.isFinite(observation.value) ||
        observation.commodity !== "copper"
      ) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.copper (
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
          "COPPER",
          observation.value,
          observation.commodity,
          observation.interval,
        ],
      );
    }

    await client.query("COMMIT");

    console.log("✓ Copper historical injection complete");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
