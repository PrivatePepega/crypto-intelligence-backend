import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const coinmarketcapAltcoinSeason: Indicator = {
  id: "coinmarketcap_altcoin_season",
  name: "CoinMarketCap Altcoin Season Index",
  domain: "Crypto",
  category: "Market Regime",
  description:
    "A daily CoinMarketCap index measuring the relative performance of major altcoins versus Bitcoin over a rolling 90-day period. The index uses the top 100 eligible coins ranked on CoinMarketCap, excluding stablecoins and wrapped or asset-backed tokens, and scales the proportion of coins outperforming Bitcoin to a 0-to-100 index.",

  source: "CoinMarketCap",
  seriesId: "coinmarketcap_altcoin_season",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Index (0-100)",

  use:
    "Track the degree to which major altcoins are outperforming or underperforming Bitcoin over a rolling 90-day period and identify shifts between Bitcoin-dominant and altcoin-dominant market regimes.",

  purpose:
    "Provide a standardized measure of altcoin market breadth relative to Bitcoin and identify broad changes in relative performance across the cryptocurrency market.",

  significance:
    "The CoinMarketCap Altcoin Season Index measures market breadth by comparing the rolling 90-day performance of the top 100 eligible coins on CoinMarketCap against Bitcoin. Stablecoins and wrapped or asset-backed tokens are excluded from the constituent set. The index reflects the proportion of these coins outperforming Bitcoin and is scaled from 1 to 100. Values above 75 indicate Altcoin Season, while values at or below 25 indicate Bitcoin Season. The index therefore measures the breadth of altcoin outperformance rather than sentiment directly: a high value means a large share of major altcoins have outperformed Bitcoin over the measurement period, while a low value means relatively few have done so. It can be analyzed alongside Bitcoin dominance, altcoin market capitalization, market breadth, liquidity, trading volume, and crypto-market sentiment to provide context for changes in market regime and capital rotation.",

  relationTags: [
    "coinmarketcap_altcoin_season",
    "coinmarketcap",
    "altcoin_season_index",
    "market_regime",
    "crypto_market",

    "altcoins",
    "bitcoin",
    "altcoin_performance",
    "bitcoin_performance",
    "relative_performance",

    "market_breadth",
    "altcoin_breadth",
    "90_day_performance",
    "rolling_performance",

    "altcoin_market_cap",
    "bitcoin_dominance",
    "capital_rotation",
    "crypto_market_regime",

    "altcoin_season",
    "bitcoin_season",
    "crypto_market_sentiment"
  ],

  status: "active",
  embedding: null,
};