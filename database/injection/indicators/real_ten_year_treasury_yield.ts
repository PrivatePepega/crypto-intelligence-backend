import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const realTenYearTreasuryYield: Indicator = {
  id: "real_ten_year_treasury_yield",
  name: "Real 10-Year Treasury Yield",
  domain: "Macroeconomics",
  category: "Interest Rates",

  description:
    "The market yield on 10-year U.S. Treasury securities whose principal and interest payments are adjusted for inflation. It represents a market-based measure of the real interest rate for a 10-year maturity.",

  source: "FRED",
  seriesId: "DFII10",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Percent",

  use:
    "Monitor real long-term interest rates and assess changes in inflation-adjusted borrowing costs, financial conditions, and market expectations.",

  purpose:
    "Provide a market-based measure of the real 10-year U.S. interest rate for analyzing real borrowing costs, inflation-adjusted returns, monetary policy, and financial conditions.",

  significance:
    "The real 10-year Treasury yield provides information about the inflation-adjusted cost of long-term capital and the pricing of inflation-indexed government securities. Changes in the yield can affect financial conditions and the relative attractiveness of real versus nominal assets.",

  relationTags: [
    "real_interest_rates",
    "treasury_yields",
    "inflation",
    "inflation_expectations",
    "monetary_policy",
    "financial_conditions",
    "government_bonds",
    "real_yields",
  ],

  status: "active",

  embedding: null,
};