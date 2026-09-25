import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type CnnFearGreedObservation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date" | "value"
> & {
  rating: string;
};

type CnnFearGreedData = Pick<NormalizedIndicatorData, "indicator"> & {
  observations: CnnFearGreedObservation[];
};

export const injectCnnFearGreedFull = async (data: CnnFearGreedData) => {
  console.log("→ CNN Fear & Greed historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const observation of data.observations) {
      if (
        observation.value === null ||
        !Number.isFinite(observation.value)
      ) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.cnn_fear_greed (
            date,
            series_id,
            value,
            rating
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,
            value = EXCLUDED.value,
            rating = EXCLUDED.rating
        `,
        [
          observation.date,
          "cnn_fear_greed",
          observation.value,
          observation.rating,
        ],
      );
    }

    await client.query("COMMIT");

    console.log("✓ CNN Fear & Greed historical injection complete");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
