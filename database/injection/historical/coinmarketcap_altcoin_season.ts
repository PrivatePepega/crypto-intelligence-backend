import pool from "../../../config/database.js";

// Matches the table name in current.coinmarketcap_alt_season_fear_greed.
export const CMC_ALT_SEASON_INDICATOR = "coinmarketcap_alt_season_fear_greed";

// Must match seriesId in database/injection/indicators/
// coinmarketcapaltcoinseason.ts, which is the FK target. Note this is
// "altcoin_season", not the table name.
export const CMC_ALT_SEASON_SERIES_ID = "coinmarketcap_altcoin_season";

export type CmcAltSeasonObservation = {
  date: string;
  index: number;
  altcoinMarketCap: number;
};

export type CmcAltSeasonHistoricalData = {
  observations: CmcAltSeasonObservation[];
  source: string;
};

const isObservationComplete = (observation: CmcAltSeasonObservation) =>
  Number.isFinite(observation.index) &&
  Number.isFinite(observation.altcoinMarketCap);

export const injectCoinMarketCapAltcoinSeasonHistorical = async (
  data: CmcAltSeasonHistoricalData,
) => {
  console.log("→ CoinMarketCap altcoin season historical injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (data.observations.length === 0) {
      throw new Error("No CoinMarketCap altcoin season observations found");
    }

    let inserted = 0;

    for (const observation of data.observations) {
      // Both metric columns are NOT NULL, so skip a malformed day rather than
      // abort the whole transaction.
      if (!isObservationComplete(observation)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.coinmarketcap_alt_season_fear_greed (
            date,
            series_id,
            index_value,
            altcoin_market_cap,
            source
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,
            index_value = EXCLUDED.index_value,
            altcoin_market_cap = EXCLUDED.altcoin_market_cap,
            source = EXCLUDED.source
        `,
        [
          observation.date,
          CMC_ALT_SEASON_SERIES_ID,
          observation.index,
          observation.altcoinMarketCap,
          data.source,
        ],
      );

      inserted += 1;
    }

    if (inserted === 0) {
      throw new Error(
        "No complete CoinMarketCap altcoin season rows to insert; every observation had a non-numeric value",
      );
    }

    await client.query("COMMIT");

    console.log(
      `✓ Injected ${inserted} CoinMarketCap altcoin season historical observations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
