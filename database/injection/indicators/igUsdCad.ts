import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const igUsdCad: Indicator = {
  id: "ig_usd_cad",
  name: "IG USD/CAD Retail Positioning",
  domain: "Financial Markets",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among retail traders on the IG trading platform for the USD/CAD currency pair. The indicator reports the percentage of IG retail traders holding long and short positions and the resulting net positioning. This data represents IG's own retail trader pool and is not a market-wide measure of all retail traders or investors.",

  source: "IG",
  seriesId: "ig_usd_cad",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Percentage",

  use:
    "Track daily changes in long and short positioning among IG retail traders exposed to USD/CAD, including the distribution of positions and the resulting net retail positioning.",

  purpose:
    "Provide a daily view of how IG's retail trader population is positioned toward the USD/CAD exchange rate and how that positioning changes over time.",

  significance:
    "IG USD/CAD retail positioning provides a daily view of directional exposure among retail traders using the IG trading platform. The indicator can provide context for retail sentiment, speculative positioning, and changes in exposure to the U.S. dollar relative to the Canadian dollar. Because the dataset represents only IG's retail trader pool rather than the entire retail-investor population, it should be interpreted as a broker-specific positioning signal rather than a comprehensive measure of overall retail sentiment. USD/CAD positioning can be analyzed alongside Bank of Canada and Federal Reserve policy, interest-rate differentials, crude oil prices, Canadian and U.S. economic conditions, and broader foreign-exchange and risk-sentiment indicators.",

  relationTags: [
  "ig_usd_cad",
  "ig_retail_traders",
  "retail_positioning",
  "retail_sentiment",
  "broker_specific_positioning",
  "usd_cad",
  "usdcad",
  "foreign_exchange",
  "currency_market",
  "us_dollar",
  "canadian_dollar",
  "long_positions",
  "short_positions",
  "net_position",
  "directional_exposure",
  ],

  status: "active",
  embedding: null,
};