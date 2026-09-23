import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const fiveYearInflationExpectations: Indicator = {
  id: "five_year_inflation_expectations",
  name: "5-Year Breakeven Inflation Rate",
  domain: "Macroeconomics",
  category: "Inflation",

  description:
    "A market-based measure of expected average inflation over the next five years, derived from the difference between 5-year nominal Treasury yields and 5-year inflation-indexed Treasury yields.",

  source: "FRED",
  seriesId: "T5YIE",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Percent",

  use:
    "Monitor market-based inflation expectations over a five-year horizon and identify changes in the outlook for future inflation.",

  purpose:
    "Provide a market-derived measure of expected average inflation over the next five years for analyzing inflation expectations, monetary policy, Treasury markets, and financial conditions.",

  significance:
    "The 5-year breakeven inflation rate reflects inflation expectations implied by the relative pricing of nominal and inflation-indexed Treasury securities. Changes in the measure can provide information about shifts in market expectations for medium-term inflation.",

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