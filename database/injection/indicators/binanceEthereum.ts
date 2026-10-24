import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const binanceEthereum: Indicator = {
  id: "binance_ethereum",
  name: "Binance Ethereum Retail Positioning",
  domain: "Crypto",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among traders in Binance's ETHUSDT market, including global account positioning and positioning metrics for Binance's top accounts. The indicator reports long and short account percentages and long-to-short ratios. This data represents Binance's own trader pool and is not a market-wide measure of Ethereum trader positioning.",

  source: "Binance",
  seriesId: "binance_ethusdt",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Ratio and Percentage",
  historicalTimeUnit: "d",

  use: "Track daily changes in long and short positioning among traders in Binance's ETHUSDT market, including global account positioning and the positioning of Binance's top accounts.",

  purpose:
    "Provide a daily view of directional positioning among traders in Binance's Ethereum market and identify changes in long and short exposure within Binance's trading ecosystem.",

  significance:
    "Binance Ethereum retail positioning provides a daily view of directional exposure among traders in Binance's ETHUSDT market. Global account positioning can provide context for the distribution of long and short accounts, while top-account and top-position metrics provide additional information about positioning among Binance's largest or most active accounts. Because the dataset represents Binance's own trader pool rather than the entire Ethereum derivatives market, it should be interpreted as an exchange-specific positioning signal rather than a comprehensive measure of market-wide positioning. Binance positioning can be analyzed alongside Ethereum price, open interest, funding rates, taker flow, derivatives activity, Ethereum network activity, staking conditions, DeFi activity, and broader crypto-market conditions to provide additional context for changes in Ethereum market positioning.",

  relationTags: [
    "binance_ethereum",
    "binance",
    "exchange_positioning",
    "retail_positioning",
    "retail_sentiment",
    "ethereum",
    "eth",
    "ethusdt",
    "ethereum_market",
    "ethereum_derivatives",
    "long_positions",
    "short_positions",
    "long_short_ratio",
    "long_accounts",
    "short_accounts",
  ],

  status: "active",
  embedding: null,
};
