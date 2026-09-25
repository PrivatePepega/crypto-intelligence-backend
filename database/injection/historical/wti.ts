import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type WtiObservation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date" | "value"
> & {
  commodity: string;
  interval: string;
};

type WtiData = Pick<NormalizedIndicatorData, "indicator" | "seriesId"> & {
  observations: WtiObservation[];
};

export const injectWtiFull = async (data: WtiData) => {
  console.log("→ WTI historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const observation of data.observations) {
      if (
        observation.value === null ||
        !Number.isFinite(observation.value) ||
        observation.commodity !== "wti"
      ) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.wti (
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
          "WTI",
          observation.value,
          observation.commodity,
          observation.interval,
        ],
      );
    }

    await client.query("COMMIT");

    console.log("✓ WTI historical injection complete");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
