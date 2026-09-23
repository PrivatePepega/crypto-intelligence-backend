import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const vix: Indicator = {
  id: "vix",
  name: "CBOE Volatility Index",
  domain: "Macroeconomics",
  category: "Financial Markets",

  description:
    "A market-based measure of expected near-term volatility in U.S. stock markets derived from stock index option prices. The series is reported as a daily closing index value and is not seasonally adjusted.",

  source: "FRED",
  seriesId: "VIXCLS",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, Close",
  nativeAggregation: "none",
  unit: "Index",

  use:
    "Monitor changes in market-implied expectations for near-term equity-market volatility and identify shifts in financial-market uncertainty and risk conditions.",

  purpose:
    "Provide a market-based measure of expected near-term stock-market volatility for analyzing investor risk expectations, market stress, financial conditions, and changes in market sentiment.",

  significance:
    "The VIX reflects volatility expectations implied by stock index option prices. Changes in the index provide information about shifts in expected near-term equity-market volatility and can help contextualize changes in broader financial-market risk conditions.",

  relationTags: [
    "vix",
    "volatility",
    "financial_markets",
    "equity_markets",
    "market_volatility",
    "market_risk",
    "risk_sentiment",
    "financial_conditions",
    "market_expectations",
  ],

  status: "active",

  embedding: null,
};