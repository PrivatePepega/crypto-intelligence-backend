import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const igGbpUsd: Indicator = {
  id: "ig_gbp_usd",
  name: "IG GBP/USD Retail Positioning",
  domain: "Financial Markets",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among retail traders on the IG trading platform for the GBP/USD currency pair. The indicator reports the percentage of IG retail traders holding long and short positions and the resulting net positioning. This data represents IG's own retail trader pool and is not a market-wide measure of all retail traders or investors.",

  source: "IG",
  seriesId: "ig_gbp_usd",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Percentage",
  historicalTimeUnit: "o",

  use: "Track daily changes in long and short positioning among IG retail traders exposed to GBP/USD, including the distribution of positions and the resulting net retail positioning.",

  purpose:
    "Provide a daily view of how IG's retail trader population is positioned toward the GBP/USD exchange rate and how that positioning changes over time.",

  significance:
    "IG GBP/USD retail positioning provides a daily view of directional exposure among retail traders using the IG trading platform. The indicator can provide context for retail sentiment, speculative positioning, and changes in exposure to the British pound relative to the U.S. dollar. Because the dataset represents only IG's retail trader pool rather than the entire retail-investor population, it should be interpreted as a broker-specific positioning signal rather than a comprehensive measure of overall retail sentiment. GBP/USD positioning can be analyzed alongside Bank of England and Federal Reserve policy, UK and U.S. interest-rate expectations, yield differentials, economic conditions, inflation, and broader foreign-exchange market dynamics to provide additional context for changes in the pound-dollar market.",

  relationTags: [
    "ig_gbp_usd",
    "ig_retail_traders",
    "retail_positioning",
    "retail_sentiment",
    "broker_specific_positioning",
    "gbp_usd",
    "gbpusd",
    "pound_dollar",
    "british_pound",
    "us_dollar",
    "foreign_exchange",
    "currency_market",
    "long_positions",
    "short_positions",
    "net_position",
  ],

  status: "active",
  embedding: null,
};
