import pool from "../../../config/database.js";
import {
  CMC_MARKET_METRICS_SERIES_ID,
  type CmcMarketMetricsObservation,
} from "../coinmarketcapMarketMetrics.js";

export type CmcMarketMetricsHistoricalData = {
  observations: CmcMarketMetricsObservation[];
  source: string;
};

// Every metric column is NOT NULL, so a day with any non-numeric value is
// skipped rather than aborting the whole transaction.
const isObservationComplete = (observation: CmcMarketMetricsObservation) =>
  Number.isFinite(observation.totalMarketCap) &&
  Number.isFinite(observation.totalVolume24h) &&
  Number.isFinite(observation.altcoinMarketCap) &&
  Number.isFinite(observation.altcoinVolume24h) &&
  Number.isFinite(observation.btcDominance) &&
  Number.isFinite(observation.ethDominance) &&
  Number.isFinite(observation.defiMarketCap) &&
  Number.isFinite(observation.defiVolume24h) &&
  Number.isFinite(observation.defi24hPercentageChange) &&
  Number.isFinite(observation.stablecoinMarketCap) &&
  Number.isFinite(observation.stablecoinVolume24h) &&
  Number.isFinite(observation.stablecoin24hPercentageChange) &&
  Number.isFinite(observation.derivativesVolume24h) &&
  Number.isFinite(observation.derivatives24hPercentageChange) &&
  Number.isFinite(observation.totalMarketCapYesterday) &&
  Number.isFinite(observation.totalVolume24hYesterday) &&
  Number.isFinite(observation.totalMarketCapYesterdayPercentageChange) &&
  Number.isFinite(observation.totalVolume24hYesterdayPercentageChange) &&
  Number.isFinite(observation.activeCryptocurrencies) &&
  Number.isFinite(observation.activeMarketPairs) &&
  Number.isFinite(observation.activeExchanges);

export const injectCoinMarketCapCryptoMarketMetricsHistorical = async (
  data: CmcMarketMetricsHistoricalData,
) => {
  console.log(
    "→ CoinMarketCap crypto market metrics historical injection initialized",
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (data.observations.length === 0) {
      throw new Error("No CoinMarketCap crypto market metric observations found");
    }

    let inserted = 0;

    for (const observation of data.observations) {
      if (!isObservationComplete(observation)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO historical.coinmarketcap_general_crypto_metric (
            date,
            series_id,

            total_market_cap,
            total_volume_24h,

            altcoin_market_cap,
            altcoin_volume_24h,

            btc_dominance,
            eth_dominance,

            defi_market_cap,
            defi_volume_24h,
            defi_24h_percentage_change,

            stablecoin_market_cap,
            stablecoin_volume_24h,
            stablecoin_24h_percentage_change,

            derivatives_volume_24h,
            derivatives_24h_percentage_change,

            total_market_cap_yesterday,
            total_volume_24h_yesterday,

            total_market_cap_yesterday_percentage_change,
            total_volume_24h_yesterday_percentage_change,

            active_cryptocurrencies,
            active_market_pairs,
            active_exchanges,

            source
          )
          VALUES (
            $1, $2,

            $3, $4,

            $5, $6,

            $7, $8,

            $9, $10, $11,

            $12, $13, $14,

            $15, $16,

            $17, $18,

            $19, $20,

            $21, $22, $23,

            $24
          )
          ON CONFLICT (date)
          DO UPDATE SET
            series_id = EXCLUDED.series_id,

            total_market_cap = EXCLUDED.total_market_cap,
            total_volume_24h = EXCLUDED.total_volume_24h,

            altcoin_market_cap = EXCLUDED.altcoin_market_cap,
            altcoin_volume_24h = EXCLUDED.altcoin_volume_24h,

            btc_dominance = EXCLUDED.btc_dominance,
            eth_dominance = EXCLUDED.eth_dominance,

            defi_market_cap = EXCLUDED.defi_market_cap,
            defi_volume_24h = EXCLUDED.defi_volume_24h,
            defi_24h_percentage_change = EXCLUDED.defi_24h_percentage_change,

            stablecoin_market_cap = EXCLUDED.stablecoin_market_cap,
            stablecoin_volume_24h = EXCLUDED.stablecoin_volume_24h,
            stablecoin_24h_percentage_change =
              EXCLUDED.stablecoin_24h_percentage_change,

            derivatives_volume_24h = EXCLUDED.derivatives_volume_24h,
            derivatives_24h_percentage_change =
              EXCLUDED.derivatives_24h_percentage_change,

            total_market_cap_yesterday = EXCLUDED.total_market_cap_yesterday,
            total_volume_24h_yesterday = EXCLUDED.total_volume_24h_yesterday,

            total_market_cap_yesterday_percentage_change =
              EXCLUDED.total_market_cap_yesterday_percentage_change,
            total_volume_24h_yesterday_percentage_change =
              EXCLUDED.total_volume_24h_yesterday_percentage_change,

            active_cryptocurrencies = EXCLUDED.active_cryptocurrencies,
            active_market_pairs = EXCLUDED.active_market_pairs,
            active_exchanges = EXCLUDED.active_exchanges,

            source = EXCLUDED.source
        `,
        [
          observation.date,
          CMC_MARKET_METRICS_SERIES_ID,

          observation.totalMarketCap,
          observation.totalVolume24h,

          observation.altcoinMarketCap,
          observation.altcoinVolume24h,

          observation.btcDominance,
          observation.ethDominance,

          observation.defiMarketCap,
          observation.defiVolume24h,
          observation.defi24hPercentageChange,

          observation.stablecoinMarketCap,
          observation.stablecoinVolume24h,
          observation.stablecoin24hPercentageChange,

          observation.derivativesVolume24h,
          observation.derivatives24hPercentageChange,

          observation.totalMarketCapYesterday,
          observation.totalVolume24hYesterday,

          observation.totalMarketCapYesterdayPercentageChange,
          observation.totalVolume24hYesterdayPercentageChange,

          observation.activeCryptocurrencies,
          observation.activeMarketPairs,
          observation.activeExchanges,

          data.source,
        ],
      );

      inserted += 1;
    }

    if (inserted === 0) {
      throw new Error(
        "No complete CoinMarketCap crypto market metric rows to insert; every observation had a non-numeric value",
      );
    }

    await client.query("COMMIT");

    console.log(
      `✓ Injected ${inserted} CoinMarketCap crypto market metric historical observations`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
