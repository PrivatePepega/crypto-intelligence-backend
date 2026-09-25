import pool from "../../../config/database.js";

type AaiiSentimentObservation = {
  date: string;
  bullish: number;
  neutral: number;
  bearish: number;
  bullBearSpread: number | null;
};

type AaiiSentimentData = {
  indicator: string;
  observations: AaiiSentimentObservation[];
};

export const injectAaiiSentimentFull = async (data: AaiiSentimentData) => {
  console.log("→ AAII Sentiment historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const observation of data.observations) {
      // bull_bear_spread is NOT NULL, and the normalizer can emit a null
      // spread even when the bullish/neutral/bearish trio is present.
      if (
        observation.bullBearSpread === null ||
        !Number.isFinite(observation.bullish) ||
        !Number.isFinite(observation.neutral) ||
        !Number.isFinite(observation.bearish) ||
        !Number.isFinite(observation.bullBearSpread)
      ) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.aaii_sentiment (
            date,
            series_id,
            bullish,
            neutral,
            bearish,
            bull_bear_spread
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,
            bullish = EXCLUDED.bullish,
            neutral = EXCLUDED.neutral,
            bearish = EXCLUDED.bearish,
            bull_bear_spread = EXCLUDED.bull_bear_spread
        `,
        [
          observation.date,
          "aaii_sentiment",
          observation.bullish,
          observation.neutral,
          observation.bearish,
          observation.bullBearSpread,
        ],
      );
    }

    await client.query("COMMIT");

    console.log("✓ AAII Sentiment historical injection complete");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
