import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cnnSafeHavenDemand: Indicator = {
  id: "cnn_safe_haven_demand",
  name: "CNN Safe Haven Demand",
  domain: "Financial Markets",
  category: "Market Health",

  description:
    "A daily measure of the difference between U.S. Treasury bond and stock returns over the previous 20 trading days. It is used by CNN to assess whether investors are favoring safer Treasury assets over riskier equities.",

  source: "CNN",
  seriesId: "cnn_safe_haven_demand",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Ratio",

  use:
    "Monitor shifts between equity risk-taking and demand for safer Treasury assets, and identify changes in investor risk appetite, defensive positioning, and market stress.",

  purpose:
    "Provide a cross-asset measure of investor risk preference by comparing recent stock and Treasury performance over a 20-trading-day period.",

  significance:
    "Safe Haven Demand captures changes in investor preference between riskier equities and safer Treasury assets. When Treasury bonds outperform stocks, it can indicate increased demand for defensive assets and greater risk aversion; when stocks outperform Treasuries, it indicates stronger relative demand for risk assets. As a component of CNN's Fear & Greed framework, it adds a cross-asset risk-preference signal that complements equity momentum, breadth, volatility, and options positioning.",

  relationTags: [
  "cnn_safe_haven_demand",
  "safe_haven_demand",
  "safe_haven",
  "treasury_bonds",
  "us_treasuries",
  "government_bonds",
  "stocks",
  "us_equities",
  "equity_market",
  "stock_market",
  "bond_market",
  "20_day_returns",
  "return_spread",
  "stock_bond_returns",
  "cross_asset",
  ],

  status: "active",
  embedding: null,
};