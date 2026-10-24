import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const nasdaqComposite: Indicator = {
  id: "nasdaq_composite",
  name: "NASDAQ Composite",
  domain: "Macroeconomics",
  category: "Financial Markets",

  description:
    "A market-capitalization-weighted index tracking more than 3,000 common equities listed on the NASDAQ Stock Market, including common stocks, American depositary receipts, real estate investment trusts, and tracking stocks. The series is reported as a daily closing index value and is not seasonally adjusted.",

  source: "FRED",
  seriesId: "NASDAQCOM",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, Close",
  nativeAggregation: "none",
  unit: "Index Feb 5, 1971=100",
  historicalTimeUnit: "m",

  use: "Monitor broad U.S. equity-market performance across companies listed on the NASDAQ and assess changes in market sentiment, risk appetite, and the performance of growth-oriented and technology-heavy segments of the equity market.",

  purpose:
    "Provide a broad benchmark for NASDAQ-listed equities for analyzing equity-market conditions, investor risk appetite, market expectations, and changes across technology and growth-oriented portions of the U.S. stock market.",

  significance:
    "The NASDAQ Composite provides broad exposure to equities listed on the NASDAQ Stock Market and includes companies across multiple industries, with substantial representation from technology and growth-oriented businesses. Changes in the index provide information about equity-market performance and investor expectations and can help contextualize broader financial-market conditions.",

  relationTags: [
    "nasdaq",
    "nasdaq_composite",
    "equity_markets",
    "stock_market",
    "financial_markets",
    "technology_stocks",
    "growth_stocks",
    "risk_sentiment",
    "risk_appetite",
    "market_expectations",
    "asset_prices",
  ],

  status: "active",

  embedding: null,
};
