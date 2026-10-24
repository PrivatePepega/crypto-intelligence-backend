import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const igSilver: Indicator = {
  id: "ig_silver",
  name: "IG Silver Retail Positioning",
  domain: "Commodities",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among retail traders on the IG trading platform for silver. The indicator reports the percentage of IG retail traders holding long and short positions and the resulting net positioning. This data represents IG's own retail trader pool and is not a market-wide measure of all retail traders or investors.",

  source: "IG",
  seriesId: "ig_silver",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Percentage",
  historicalTimeUnit: "o",

  use: "Track daily changes in long and short positioning among IG retail traders exposed to silver, including the distribution of positions and the resulting net retail positioning.",

  purpose:
    "Provide a daily view of how IG's retail trader population is positioned toward silver and how that positioning changes over time.",

  significance:
    "IG silver retail positioning provides a daily view of directional exposure among retail traders using the IG trading platform. The indicator can provide context for retail sentiment, speculative positioning, and changes in exposure to silver. Because the dataset represents only IG's retail trader pool rather than the entire retail-investor population, it should be interpreted as a broker-specific positioning signal rather than a comprehensive measure of overall retail sentiment. Silver positioning can be analyzed alongside silver prices, gold, industrial demand, manufacturing activity, inflation expectations, real interest rates, Treasury yields, the U.S. dollar, Federal Reserve policy, and broader risk sentiment to provide additional context for precious-metals and industrial-demand conditions.",

  relationTags: [
    "ig_silver",
    "ig_retail_traders",
    "retail_positioning",
    "retail_sentiment",
    "broker_specific_positioning",
    "silver",
    "silver_price",
    "silver_market",
    "precious_metals",
    "commodity_market",
    "long_positions",
    "short_positions",
    "net_position",
    "directional_exposure",
    "positioning_changes",
  ],

  status: "active",
  embedding: null,
};
