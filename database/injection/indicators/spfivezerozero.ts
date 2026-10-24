import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const sp500: Indicator = {
  id: "sp_five_zero_zero",
  name: "S&P 500",
  domain: "Macroeconomics",
  category: "Financial Markets",

  description:
    "A market-capitalization-weighted index of 500 leading publicly traded U.S. companies across major industries, representing a broad measure of the large-cap U.S. equity market. The series is reported as a daily closing index value and is not seasonally adjusted.",

  source: "FRED",
  seriesId: "SP500",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, Close",
  nativeAggregation: "none",
  unit: "Index",
  historicalTimeUnit: "m",

  use: "Monitor broad U.S. equity-market performance and assess changes in investor risk appetite, financial conditions, market expectations, and the valuation of large-cap U.S. companies.",

  purpose:
    "Provide a broad benchmark for U.S. large-cap equity markets for analyzing financial-market conditions, risk sentiment, economic expectations, and relationships between equity markets and macroeconomic indicators.",

  significance:
    "The S&P 500 is a widely followed benchmark for the U.S. large-cap equity market. Changes in the index provide information about equity-market performance and investor expectations and can help contextualize broader financial conditions and risk sentiment. The series is a price index and does not include dividends or represent total return.",

  relationTags: [
    "sp500",
    "equity_markets",
    "stock_market",
    "financial_markets",
    "large_cap_equities",
    "risk_sentiment",
    "risk_appetite",
    "financial_conditions",
    "market_expectations",
    "asset_prices",
  ],

  status: "active",

  embedding: null,
};
