import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const igNasdaq: Indicator = {
  id: "ig_nasdaq",
  name: "IG Nasdaq-100 Retail Positioning",
  domain: "Financial Markets",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among retail traders on the IG trading platform for the Nasdaq-100. The indicator reports the percentage of IG retail traders holding long and short positions and the resulting net positioning. This data represents IG's own retail trader pool and is not a market-wide measure of all retail traders or investors.",

  source: "IG",
  seriesId: "ig_nasdaq",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Percentage",

  use:
    "Track daily changes in long and short positioning among IG retail traders exposed to the Nasdaq-100, including the distribution of positions and the resulting net retail positioning.",

  purpose:
    "Provide a daily view of how IG's retail trader population is positioned toward the Nasdaq-100 and how that positioning changes over time.",

  significance:
    "IG Nasdaq-100 retail positioning provides a daily view of directional exposure among retail traders using the IG trading platform. The indicator can provide context for retail sentiment, speculative positioning, and changes in exposure to large-cap technology and growth-oriented equities. Because the dataset represents only IG's retail trader pool rather than the entire retail-investor population, it should be interpreted as a broker-specific positioning signal rather than a comprehensive measure of overall retail sentiment. Nasdaq-100 positioning can be analyzed alongside technology-sector performance, Federal Reserve policy, interest rates, Treasury yields, volatility, market breadth, economic growth, and broader equity-market conditions to provide additional context for U.S. technology and growth-equity markets.",

  relationTags: [
    "ig_nasdaq",
    "ig_retail_traders",
    "retail_positioning",
    "retail_sentiment",
    "broker_specific_positioning",

    "nasdaq",
    "nasdaq_100",
    "nasdaq_100_index",
    "ndx",
    "us_equities",
    "equity_index",
    "large_cap_equities",

    "technology_stocks",
    "technology_sector",
    "growth_stocks",
    "growth_equities",

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

    "economic_growth",
    "us_economy",

    "volatility",
    "vix",
    "equity_market_breadth",

    "sp500",
    "dow_jones",
    "russell_2000",
    "us_stock_market",

    "risk_sentiment",
    "financial_markets"
  ],

  status: "active",
  embedding: null,
};