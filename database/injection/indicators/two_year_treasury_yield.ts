import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const twoYearTreasuryYield: Indicator = {
  id: "two_year_treasury_yield",
  name: "2-Year Treasury Yield",
  domain: "Macroeconomics",
  category: "Interest Rates",

  description:
    "The market yield on U.S. Treasury securities with a constant maturity of two years, quoted on an investment basis. It reflects market expectations and pricing for short-term U.S. government borrowing.",

  source: "FRED",
  seriesId: "DGS2",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Percent",
  historicalTimeUnit: "o",

  use: "Monitor short-term U.S. interest rates, Treasury market conditions, monetary policy expectations, and changes in the cost of government borrowing.",

  purpose:
    "Provide a market-based measure of the two-year point on the U.S. Treasury yield curve for analyzing interest-rate expectations, monetary policy, financial conditions, and relationships across the yield curve.",

  significance:
    "The two-year Treasury yield is closely connected to expectations for future monetary policy and short-term interest rates. Changes in the yield can provide information about shifts in interest-rate expectations and broader financial conditions.",

  relationTags: [
    "treasury_yields",
    "interest_rates",
    "monetary_policy",
    "yield_curve",
    "financial_conditions",
    "government_bonds",
    "market_expectations",
  ],

  status: "active",

  embedding: null,
};
