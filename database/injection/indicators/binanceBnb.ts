import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const binanceBnb: Indicator = {
  id: "binance_bnb",
  name: "Binance BNB Retail Positioning",
  domain: "Crypto",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among traders in Binance's BNBUSDT market, including global account positioning and positioning metrics for Binance's top accounts. The indicator reports long and short account percentages and long-to-short ratios. This data represents Binance's own trader pool and is not a market-wide measure of BNB trader positioning.",

  source: "Binance",
  seriesId: "binance_bnbusdt",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Ratio and Percentage",

  use:
    "Track daily changes in long and short positioning among traders in Binance's BNBUSDT market, including global account positioning and the positioning of Binance's top accounts.",

  purpose:
    "Provide a daily view of directional positioning among traders in Binance's BNB market and identify changes in long and short exposure within Binance's trading ecosystem.",

  significance:
    "Binance BNB retail positioning provides a daily view of directional exposure among traders in Binance's BNBUSDT market. Global account positioning can provide context for the distribution of long and short accounts, while top-account and top-position metrics provide additional information about positioning among Binance's largest or most active accounts. Because the dataset represents Binance's own trader pool rather than the entire BNB derivatives market, it should be interpreted as an exchange-specific positioning signal rather than a comprehensive measure of market-wide positioning. Binance positioning can be analyzed alongside BNB price, open interest, funding rates, derivatives activity, BNB Chain activity, staking, DeFi activity, and broader crypto-market conditions to provide additional context for changes in BNB market positioning.",

  relationTags: [
    "binance_bnb",
    "binance",
    "exchange_positioning",
    "retail_positioning",
    "retail_sentiment",

    "bnb",
    "bnbusdt",
    "bnb_market",
    "bnb_chain",
    "bnb_derivatives",

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

    "bnb_price",
    "bnb_chain_activity",
    "bnb_staking",
    "defi",

    "crypto_market",
    "crypto_market_sentiment"
  ],

  status: "active",
  embedding: null,
};