import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type CnnSafeHavenDemandObservation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date" | "value"
> & {
  rating: string;
};

type CnnSafeHavenDemandData = Pick<NormalizedIndicatorData, "indicator"> & {
  observations: CnnSafeHavenDemandObservation[];
};

export const injectCnnSafeHavenDemandFull = async (
  data: CnnSafeHavenDemandData,
) => {
  console.log(
    "→ CNN Safe Haven Demand historical injection initialized",
  );

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
          INSERT INTO historical.cnn_safe_haven_demand (
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
          "cnn_safe_haven_demand",
          observation.value,
          observation.rating,
        ],
      );
    }

    await client.query("COMMIT");

    console.log(
      "✓ CNN Safe Haven Demand historical injection complete",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
