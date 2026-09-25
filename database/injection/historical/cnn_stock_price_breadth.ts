import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type CnnStockPriceBreadthObservation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date" | "value"
> & {
  rating: string;
};

type CnnStockPriceBreadthData = Pick<NormalizedIndicatorData, "indicator"> & {
  observations: CnnStockPriceBreadthObservation[];
};

export const injectCnnStockPriceBreadthFull = async (
  data: CnnStockPriceBreadthData,
) => {
  console.log(
    "→ CNN Stock Price Breadth historical injection initialized",
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
          INSERT INTO historical.cnn_stock_price_breadth (
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
          "cnn_stock_price_breadth",
          observation.value,
          observation.rating,
        ],
      );
    }

    await client.query("COMMIT");

    console.log(
      "✓ CNN Stock Price Breadth historical injection complete",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
