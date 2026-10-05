import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const igSp500: Indicator = {
  id: "ig_sp_five_zero_zero",
  name: "IG S&P 500 Retail Positioning",
  domain: "Financial Markets",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among retail traders on the IG trading platform for the S&P 500. The indicator reports the percentage of IG retail traders holding long and short positions and the resulting net positioning. This data represents IG's own retail trader pool and is not a market-wide measure of all retail traders or investors.",

  source: "IG",
  seriesId: "ig_sp500",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Percentage",

  use:
    "Track daily changes in long and short positioning among IG retail traders exposed to the S&P 500, including the distribution of positions and the resulting net retail positioning.",

  purpose:
    "Provide a daily view of how IG's retail trader population is positioned toward the S&P 500 and how that positioning changes over time.",

  significance:
    "IG S&P 500 retail positioning provides a daily view of directional exposure among retail traders using the IG trading platform. The indicator can provide context for retail sentiment, speculative positioning, and changes in exposure to the U.S. equity market. Because the dataset represents only IG's retail trader pool rather than the entire retail-investor population, it should be interpreted as a broker-specific positioning signal rather than a comprehensive measure of overall retail sentiment. S&P 500 positioning can be analyzed alongside Federal Reserve policy, interest rates, Treasury yields, volatility, market breadth, institutional positioning, economic conditions, and broader U.S. equity-market indicators to provide additional context for changes in market positioning.",

  relationTags: [
  "ig_sp500",
  "ig_retail_traders",
  "retail_positioning",
  "retail_sentiment",
  "broker_specific_positioning",
  "sp500",
  "s_and_p_500",
  "us_equities",
  "equity_index",
  "large_cap_equities",
  "us_stock_market",
  "long_positions",
  "short_positions",
  "net_position",
  "directional_exposure",
  ],

  status: "active",
  embedding: null,
};