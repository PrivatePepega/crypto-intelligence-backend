import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

type CnnMarketVolatilityVix50Observation = Pick<
  NormalizedIndicatorData["observations"][number],
  "date" | "value"
> & {
  rating: string;
};

type CnnMarketVolatilityVix50Data = Pick<NormalizedIndicatorData, "indicator"> & {
  observations: CnnMarketVolatilityVix50Observation[];
};

export const injectCnnMarketVolatilityVix50Full = async (
  data: CnnMarketVolatilityVix50Data,
) => {
  console.log(
    "→ CNN Market Volatility VIX 50 historical injection initialized",
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
          INSERT INTO historical.cnn_market_volatility_vix_50 (
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
          "cnn_market_volatility_vix_50",
          observation.value,
          observation.rating,
        ],
      );
    }

    await client.query("COMMIT");

    console.log(
      "✓ CNN Market Volatility VIX 50 historical injection complete",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
