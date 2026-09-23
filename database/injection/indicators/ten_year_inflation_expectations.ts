import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const tenYearInflationExpectations: Indicator = {
  id: "ten_year_inflation_expectations",
  name: "10-Year Breakeven Inflation Rate",
  domain: "Macroeconomics",
  category: "Inflation",

  description:
    "A market-based measure of expected average inflation over the next ten years, derived from the difference between 10-year nominal Treasury yields and 10-year inflation-indexed Treasury yields.",

  source: "FRED",
  seriesId: "T10YIE",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Percent",

  use:
    "Monitor market-based inflation expectations over a ten-year horizon and identify changes in the outlook for long-term inflation.",

  purpose:
    "Provide a market-derived measure of expected average inflation over the next ten years for analyzing inflation expectations, monetary policy, Treasury markets, and financial conditions.",

  significance:
    "The 10-year breakeven inflation rate reflects inflation expectations implied by the relative pricing of nominal and inflation-indexed Treasury securities. Changes in the measure can provide information about shifts in market expectations for long-term inflation.",

  relationTags: [
    "inflation",
    "inflation_expectations",
    "breakeven_inflation",
    "treasury_yields",
    "real_yields",
    "monetary_policy",
    "financial_conditions",
    "market_expectations",
  ],

  status: "active",

  embedding: null,
};