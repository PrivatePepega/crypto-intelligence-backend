import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const igDowJones: Indicator = {
  id: "ig_dow_jones",
  name: "IG Dow Jones Retail Positioning",
  domain: "Financial Markets",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among retail traders on the IG trading platform for the Dow Jones Industrial Average. The indicator reports the percentage of IG retail traders holding long and short positions and the resulting net positioning. This data represents IG's own retail trader pool and is not a market-wide measure of all retail traders or investors.",

  source: "IG",
  seriesId: "ig_dow_jones",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Percentage",

  use:
    "Track daily changes in long and short positioning among IG retail traders exposed to the Dow Jones Industrial Average, including the distribution of positions and the resulting net retail positioning.",

  purpose:
    "Provide a daily view of how IG's retail trader population is positioned toward the Dow Jones Industrial Average and how that positioning changes over time.",

  significance:
    "IG Dow Jones retail positioning provides a daily view of directional exposure among retail traders using the IG trading platform. The indicator can provide context for retail sentiment, speculative positioning, and changes in exposure to U.S. large-cap and blue-chip equities. Because the dataset represents only IG's retail trader pool rather than the entire retail-investor population, it should be interpreted as a broker-specific positioning signal rather than a comprehensive measure of overall retail sentiment. Dow Jones positioning can be analyzed alongside Federal Reserve policy, interest rates, Treasury yields, economic conditions, market breadth, volatility, and broader U.S. equity indexes to provide additional context for U.S. equity-market conditions.",

  relationTags: [
    "ig_dow_jones",
    "ig_retail_traders",
    "retail_positioning",
    "retail_sentiment",
    "broker_specific_positioning",

    "dow_jones",
    "dow_jones_industrial_average",
    "djia",
    "us_equities",
    "equity_index",
    "large_cap_equities",
    "blue_chip_stocks",

    "long_positions",
    "short_positions",
    "net_position",
    "directional_exposure",
    "positioning_changes",

    "federal_reserve",
    "fed_policy",
    "monetary_policy",
    "interest_rates",
    "treasury_yields",
    "financial_conditions",

    "us_economy",
    "economic_growth",
    "economic_conditions",

    "sp500",
    "nasdaq_100",
    "russell_2000",
    "equity_market_breadth",
    "volatility",
    "vix",

    "risk_sentiment",
    "us_stock_market",
    "financial_markets"
  ],

  status: "active",
  embedding: null,
};