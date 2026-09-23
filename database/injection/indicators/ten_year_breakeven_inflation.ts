import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const tenYearBreakevenInflation: Indicator = {
  id: "ten_year_breakeven_inflation",
  name: "10-Year Breakeven Inflation Rate",
  domain: "Macroeconomics",
  category: "Inflation",

  description:
    "A market-based measure of expected average inflation over the next ten years, derived from the difference between nominal 10-year Treasury yields and 10-year Treasury inflation-indexed securities.",

  source: "FRED",
  seriesId: "T10YIE",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Percent",

  use:
    "Monitor market-based inflation expectations and changes in the outlook for long-term inflation.",

  purpose:
    "Provide a market-derived measure of expected average inflation over a ten-year horizon for analyzing inflation expectations, Treasury markets, monetary policy, and financial conditions.",

  significance:
    "The 10-year breakeven inflation rate reflects the inflation compensation implied by the pricing difference between nominal and inflation-indexed Treasury securities. Changes in the measure can provide information about shifts in market-based inflation expectations.",

  relationTags: [
    "inflation",
    "inflation_expectations",
    "treasury_yields",
    "monetary_policy",
    "financial_conditions",
    "real_yields",
    "market_expectations",
  ],

  status: "active",

  embedding: null,
};