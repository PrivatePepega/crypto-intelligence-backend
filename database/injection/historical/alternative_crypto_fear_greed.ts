import pool from "../../../config/database.js";

// Matches the table name in current.alternative_fear_greed, following the
// convention used by the IG and Binance injectors for the indicator key.
export const ALTERNATIVE_FEAR_GREED_INDICATOR = "alternative_fear_greed";

// Must match seriesId in database/injection/indicators/
// alternativecryptofeargreed.ts, which is the FK target.
export const ALTERNATIVE_FEAR_GREED_SERIES_ID =
  "alternative_crypto_fear_greed";

export type AlternativeFearGreedObservation = {
  date: string;
  value: number;
  classification: string;
  source: string;
};

export type AlternativeFearGreedHistoricalData = {
  observations: AlternativeFearGreedObservation[];
};

const isObservationComplete = (observation: AlternativeFearGreedObservation) =>
  Number.isFinite(observation.value);

export const injectAlternativeCryptoFearGreedHistorical = async (
  data: AlternativeFearGreedHistoricalData,
) => {
  console.log("→ Alternative.me Fear & Greed historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (data.observations.length === 0) {
      throw new Error("No Alternative.me Fear & Greed observations found");
    }

    let inserted = 0;

    for (const observation of data.observations) {
      // value is NOT NULL, so skip a malformed row rather than abort the whole
      // transaction.
      if (!isObservationComplete(observation)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.alternative_fear_greed (
            date,
            series_id,
            value,
            classification,
            source
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,
            value = EXCLUDED.value,
            classification = EXCLUDED.classification,
            source = EXCLUDED.source
        `,
        [
          observation.date,
          ALTERNATIVE_FEAR_GREED_SERIES_ID,
          observation.value,
          observation.classification,
          observation.source,
        ],
      );

      inserted += 1;
    }

    if (inserted === 0) {
      throw new Error(
        "No complete Alternative.me Fear & Greed rows to insert; every observation had a non-numeric value",
      );
    }

    await client.query("COMMIT");

    console.log(
      `✓ Injected ${inserted} Alternative.me crypto fear & greed historical observations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
