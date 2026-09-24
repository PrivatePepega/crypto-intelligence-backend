import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const fiveYearTreasury: Indicator = {
  id: "five_y_treasury",
  name: "5-Year Treasury Yield",
  domain: "Macroeconomics",
  category: "Interest Rates",

  description:
    "The market yield on U.S. Treasury securities with a constant maturity of five years, quoted on an investment basis. The series is reported daily and is not seasonally adjusted.",

  source: "FRED",
  seriesId: "DGS5",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Percent",

  use:
    "Monitor intermediate-term U.S. Treasury interest rates and assess changes in market expectations, monetary policy transmission, inflation expectations, and broader financial conditions.",

  purpose:
    "Provide a market-based measure of the five-year point on the U.S. Treasury yield curve for analyzing intermediate-term interest rates, economic expectations, monetary policy, and changes in financial conditions.",

  significance:
    "The five-year Treasury yield reflects market pricing for intermediate-term U.S. government borrowing and incorporates expectations about future interest rates, inflation, and economic conditions. Changes in the yield can provide information about shifts in the middle portion of the Treasury yield curve and broader financial-market expectations.",

  relationTags: [
    "treasury_yields",
    "interest_rates",
    "yield_curve",
    "monetary_policy",
    "inflation_expectations",
    "economic_growth",
    "financial_conditions",
    "government_bonds",
    "market_expectations",
  ],

  status: "active",

  embedding: null,
};