import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const igBrentCrudeOil: Indicator = {
  id: "ig_brent_crude_oil",
  name: "IG Brent Crude Oil Retail Positioning",
  domain: "Commodities",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among retail traders on the IG trading platform for Brent crude oil. The indicator reports the percentage of IG retail traders holding long and short positions and the resulting net positioning. This data represents IG's own retail trader pool and is not a market-wide measure of all retail traders or investors.",

  source: "IG",
  seriesId: "ig_brent_crude_oil",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Percentage",

  use:
    "Track daily changes in long and short positioning among IG retail traders exposed to Brent crude oil, including the distribution of positions and the resulting net retail positioning.",

  purpose:
    "Provide a daily view of how IG's retail trader population is positioned toward Brent crude oil and how that positioning changes over time.",

  significance:
    "IG Brent crude oil retail positioning provides a daily view of directional exposure among retail traders using the IG trading platform. The indicator can provide context for retail sentiment, speculative positioning, and changes in exposure to the global crude oil market. Because the dataset represents only IG's retail trader pool rather than the entire retail-investor population, it should be interpreted as a broker-specific positioning signal rather than a comprehensive measure of overall retail sentiment. Brent positioning can be analyzed alongside crude oil supply and demand, OPEC policy, oil inventories, geopolitical developments, global economic growth, the U.S. dollar, and the Brent-WTI relationship to provide additional context for global energy-market conditions.",

  relationTags: [
  "ig_brent_crude_oil",
  "ig_retail_traders",
  "retail_positioning",
  "retail_sentiment",
  "broker_specific_positioning",
  "brent",
  "brent_crude_oil",
  "brent_price",
  "crude_oil",
  "oil_market",
  "global_oil_market",
  "energy_market",
  "long_positions",
  "short_positions",
  "net_position",
  ],

  status: "active",
  embedding: null,
};