import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const russell2000: Indicator = {
  id: "russell_two_zero_zero_zero",
  name: "Russell 2000 Index",
  domain: "Financial Markets",
  category: "Equity Index",
  description:
    "A daily measure of the Russell 2000 Index, a benchmark for U.S. small-cap equities, reported through Financial Modeling Prep. The indicator provides daily open, close, absolute change, and percentage change for the index.",

  source: "FMP",
  seriesId: "^RUT",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Index Points",

  use:
    "Track daily movements in the Russell 2000 Index, including opening level, closing level, absolute price change, and percentage change, to monitor U.S. small-cap equity-market conditions.",

  purpose:
    "Provide visibility into the performance and short-term direction of U.S. small-cap equities as a distinct segment of the broader U.S. stock market.",

  significance:
    "The Russell 2000 is a widely used benchmark for U.S. small-cap equities and provides a different market perspective from large-cap indexes such as the S&P 500 and technology-heavy indexes such as the Nasdaq-100. Movements in the index can provide context for investor risk appetite, domestic economic expectations, financial conditions, credit conditions, and the relative performance of smaller U.S. companies. Because smaller companies can be more sensitive to domestic economic activity and financing conditions, Russell 2000 performance can complement broader equity-market indicators when analyzing U.S. market conditions and risk sentiment.",

  relationTags: [
    "russell_2000",
    "russell2000",
    "rut",
    "rut_index",
    "rut_2000",
    "russell_2000_index",

    "us_equities",
    "us_equity_market",
    "us_stock_market",
    "equity_market",
    "stock_market",
    "equity_index",
    "stock_index",
    "equity_indices",
    "small_cap",
    "small_cap_stocks",
    "small_cap_equities",
    "us_small_cap",
    "us_small_cap_equities",
    "small_cap_market",

    "domestic_equities",
    "domestic_economic_exposure",
    "us_economic_exposure",
    "economic_growth",
    "economic_expectations",
    "us_economy",
    "us_economic_conditions",
    "business_conditions",
    "corporate_conditions",

    "risk_appetite",
    "risk_sentiment",
    "market_sentiment",
    "investor_sentiment",
    "equity_market_sentiment",
    "risk_on",
    "risk_off",
    "market_risk",

    "financial_conditions",
    "credit_conditions",
    "borrowing_conditions",
    "interest_rates",
    "monetary_policy",
    "federal_reserve",
    "fed",
    "fed_policy",

    "equity_performance",
    "market_performance",
    "index_level",
    "index_points",
    "daily_return",
    "daily_change",
    "percentage_change",
    "price_change",

    "large_cap",
    "large_cap_equities",
    "sp500",
    "nasdaq_100",
    "equity_market_breadth",
    "market_regime",
    "financial_markets"
  ],

  status: "active",
  embedding: null,
};