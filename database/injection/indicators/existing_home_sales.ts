import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const existingHomeSales: Indicator = {
  id: "existing_home_sales",
  name: "Existing Home Sales",
  domain: "Macroeconomics",
  category: "Housing",

  description:
    "The volume of transactions involving existing single-family homes, condominiums, and cooperative housing units in the United States. The series is reported monthly as a seasonally adjusted annual rate and expressed as the number of units.",

  source: "FRED",
  seriesId: "EXHOSLUSM495S",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Number of Units",
  historicalTimeUnit: "m",

  use: "Monitor activity in the existing residential housing market and assess changes in home-buying demand, housing-market turnover, and broader economic conditions.",

  purpose:
    "Provide a measure of existing-home transaction volume for analyzing housing-market activity, household demand, market turnover, and the relationship between housing conditions and the broader economy.",

  significance:
    "Existing-home sales measure the volume of transactions for homes that were previously owned and occupied. Changes in sales activity can provide information about housing demand, market liquidity, affordability conditions, and household behavior, although transaction volume can also be affected by housing inventory and financing conditions.",

  relationTags: [
    "housing",
    "existing_home_sales",
    "home_sales",
    "housing_market",
    "housing_demand",
    "housing_inventory",
    "home_buying",
    "households",
    "interest_rates",
    "financial_conditions",
    "economic_activity",
  ],

  status: "active",

  embedding: null,
};
