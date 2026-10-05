import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const coinmarketcapCryptoMarketMetrics: Indicator = {
  id: "coinmarketcap_crypto_market_metrics",
  name: "CoinMarketCap Crypto Market Metrics",
  domain: "Crypto",
  category: "Market Metrics",
  description:
    "A market-wide daily snapshot from CoinMarketCap containing aggregate cryptocurrency market capitalization, trading volume, market-share measures, sector-level market capitalization and volume, derivatives activity, market growth rates, and ecosystem activity statistics. The dataset provides a broad view of crypto-market size, liquidity, market structure, capital distribution, and changes in market activity within a single observation.",

  source: "CoinMarketCap",
  seriesId: "coinmarketcap_crypto_market_metrics",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Multiple Market Metrics",

  use:
    "Monitor the overall size, liquidity, composition, activity, and structural changes of the cryptocurrency market using CoinMarketCap's aggregate market metrics.",

  purpose:
    "Provide a consolidated market-wide snapshot for understanding total crypto-market capitalization, trading activity, Bitcoin and Ethereum market share, altcoin and DeFi market size, stablecoin liquidity, derivatives activity, and changes in the broader crypto ecosystem.",

  significance:
    "CoinMarketCap Crypto Market Metrics provides broad market context that can be used to interpret changes across individual crypto assets and specialized indicators. Total market capitalization measures the aggregate value of the cryptocurrency market, while 24-hour spot trading volume provides a measure of market activity and liquidity. Altcoin market capitalization and volume help isolate activity outside Bitcoin, while Bitcoin and Ethereum dominance measure their respective shares of the total cryptocurrency market and can provide context for capital distribution and rotation. DeFi market capitalization and volume provide visibility into decentralized-finance activity, while stablecoin market capitalization and volume provide context for the size and activity of crypto-native liquidity instruments. Derivatives volume provides a measure of activity in crypto derivatives markets. The dataset also includes daily percentage changes in total market capitalization, total volume, DeFi activity, stablecoin activity, and derivatives activity, allowing the system to identify rapid changes in market conditions. Active cryptocurrency, market-pair, and exchange counts provide additional context for the size and breadth of the crypto ecosystem. These metrics can be analyzed alongside asset prices, market breadth, volatility, derivatives positioning, funding rates, stablecoin indicators, Bitcoin dominance, DeFi indicators, and macroeconomic conditions to identify changes in liquidity, market participation, capital rotation, and broader crypto-market regimes.",

  relationTags: [
  "coinmarketcap",
  "coinmarketcap_market_metrics",
  "crypto_market_metrics",
  "crypto_market",
  "market_structure",
  "total_market_cap",
  "total_crypto_market_cap",
  "market_capitalization",
  "total_market_volume",
  "crypto_trading_volume",
  "market_liquidity",
  "altcoin_market_cap",
  "altcoin_volume",
  "altcoins",
  "altcoin_market",
  ],

  status: "active",
  embedding: null,
};