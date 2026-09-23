import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const binanceBitcoin: Indicator = {
  id: "binance_bitcoin",
  name: "Binance Bitcoin Retail Positioning",
  domain: "Crypto",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among traders in Binance's BTCUSDT market, including global account positioning and positioning metrics for Binance's top accounts. The indicator reports long and short account percentages and long-to-short ratios. This data represents Binance's own trader pool and is not a market-wide measure of Bitcoin trader positioning.",

  source: "Binance",
  seriesId: "binance_btcusdt",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Ratio and Percentage",

  use:
    "Track daily changes in long and short positioning among traders in Binance's BTCUSDT market, including global account positioning and the positioning of Binance's top accounts.",

  purpose:
    "Provide a daily view of directional positioning among traders in Binance's Bitcoin market and identify changes in long and short exposure within Binance's trading ecosystem.",

  significance:
    "Binance Bitcoin retail positioning provides a daily view of directional exposure among traders in Binance's BTCUSDT market. Global account positioning can provide context for the distribution of long and short accounts, while top-account and top-position metrics provide additional information about positioning among Binance's largest or most active accounts. Because the dataset represents Binance's own trader pool rather than the entire Bitcoin derivatives market, it should be interpreted as an exchange-specific positioning signal rather than a comprehensive measure of market-wide positioning. Binance positioning can be analyzed alongside Bitcoin price, open interest, funding rates, taker flow, liquidations, derivatives activity, and broader crypto-market conditions to provide additional context for changes in Bitcoin market positioning.",

  relationTags: [
    "binance_bitcoin",
    "binance",
    "exchange_positioning",
    "retail_positioning",
    "retail_sentiment",

    "bitcoin",
    "btc",
    "btcusdt",
    "bitcoin_market",
    "bitcoin_derivatives",

    "long_positions",
    "short_positions",
    "long_short_ratio",
    "long_accounts",
    "short_accounts",
    "directional_exposure",
    "positioning_changes",

    "global_account_positioning",
    "top_account_positioning",
    "top_position_positioning",

    "open_interest",
    "funding_rate",
    "derivatives_activity",

    "bitcoin_price",
    "crypto_market",
    "crypto_market_sentiment",
    "crypto_positioning"
  ],

  status: "active",
  embedding: null,
};