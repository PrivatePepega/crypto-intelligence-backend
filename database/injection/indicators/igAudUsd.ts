import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const igAudUsd: Indicator = {
  id: "ig_aud_usd",
  name: "IG AUD/USD Retail Positioning",
  domain: "Financial Markets",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among retail traders on the IG trading platform for the AUD/USD currency pair. The indicator reports the percentage of IG retail traders holding long and short positions and the resulting net positioning. This data represents IG's own retail trader pool and is not a market-wide measure of all retail traders or investors.",

  source: "IG",
  seriesId: "ig_aud_usd",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Percentage",

  use:
    "Track daily changes in long and short positioning among IG retail traders exposed to AUD/USD, including the distribution of positions and the resulting net retail positioning.",

  purpose:
    "Provide a daily view of how IG's retail trader population is positioned toward the AUD/USD exchange rate and how that positioning changes over time.",

  significance:
    "IG AUD/USD retail positioning provides a daily view of directional exposure among retail traders using the IG trading platform. The indicator can provide context for retail sentiment, speculative positioning, and changes in exposure to the Australian dollar relative to the U.S. dollar. Because the dataset represents only IG's retail trader pool rather than the entire retail-investor population, it should be interpreted as a broker-specific positioning signal rather than a comprehensive measure of overall retail sentiment. AUD/USD positioning can be analyzed alongside Reserve Bank of Australia and Federal Reserve policy, interest-rate differentials, commodity prices, Chinese economic conditions, global growth, and broader risk sentiment to provide additional context for changes in the Australian dollar market.",

  relationTags: [
    "ig_aud_usd",
    "ig_retail_traders",
    "retail_positioning",
    "retail_sentiment",
    "broker_specific_positioning",

    "aud_usd",
    "audusd",
    "australian_dollar",
    "us_dollar",
    "foreign_exchange",
    "currency_market",

    "long_positions",
    "short_positions",
    "net_position",
    "directional_exposure",
    "positioning_changes",

    "reserve_bank_of_australia",
    "rba_policy",
    "federal_reserve",
    "fed_policy",
    "monetary_policy",
    "interest_rate_differential",

    "australian_economy",
    "us_economy",
    "economic_growth",

    "commodity_prices",
    "commodity_currencies",
    "iron_ore",
    "china",
    "chinese_economy",

    "risk_sentiment",
    "currency_strength",
    "fx_positioning",
    "financial_conditions",
    "financial_markets"
  ],

  status: "active",
  embedding: null,
};