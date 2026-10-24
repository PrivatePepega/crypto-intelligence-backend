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
  historicalTimeUnit: "d",

  use: "Track daily movements in the Russell 2000 Index, including opening level, closing level, absolute price change, and percentage change, to monitor U.S. small-cap equity-market conditions.",

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
  ],

  status: "active",
  embedding: null,
};
