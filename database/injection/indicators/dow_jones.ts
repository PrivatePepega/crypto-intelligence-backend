import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const dowJones: Indicator = {
  id: "dow_jones",
  name: "Dow Jones Industrial Average",
  domain: "Macroeconomics",
  category: "Financial Markets",

  description:
    "A stock-market index tracking 30 large, established U.S. companies across a range of industries. The series is reported as a daily closing index value and is not seasonally adjusted.",

  source: "FRED",
  seriesId: "DJIA",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, Close",
  nativeAggregation: "none",
  unit: "Index",
  historicalTimeUnit: "m",

  use: "Monitor the performance of a group of large U.S. companies and assess changes in equity-market conditions, investor sentiment, risk appetite, and market expectations.",

  purpose:
    "Provide a widely followed benchmark for large-cap U.S. equities for analyzing financial-market conditions, equity performance, investor risk appetite, and changes in market expectations.",

  significance:
    "The Dow Jones Industrial Average provides a market-based measure of the performance of 30 large U.S. companies across multiple industries. Changes in the index provide information about equity-market performance and can help contextualize broader financial conditions and investor sentiment.",

  relationTags: [
    "dow_jones",
    "djia",
    "equity_markets",
    "stock_market",
    "financial_markets",
    "large_cap_equities",
    "risk_sentiment",
    "risk_appetite",
    "market_expectations",
    "asset_prices",
  ],

  status: "active",

  embedding: null,
};
