import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const nonfarmPayrolls: Indicator = {
  id: "nonfarm_payrolls",
  name: "Nonfarm Payrolls",
  domain: "Macroeconomics",
  category: "Labor Market",

  description:
    "The number of employees in the U.S. nonfarm economy, excluding proprietors, private household employees, unpaid volunteers, farm employees, and the unincorporated self-employed. The series is seasonally adjusted and reported in thousands of persons.",

  source: "FRED",
  seriesId: "PAYEMS",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "average",
  unit: "Thousands of Persons",

  use:
    "Monitor changes in total nonfarm employment and assess labor-market conditions, job creation, and changes in overall economic activity.",

  purpose:
    "Provide a broad measure of U.S. employment for analyzing labor-market strength, economic growth, household income, business activity, and changes in the business cycle.",

  significance:
    "Nonfarm payrolls are a major measure of U.S. employment and provide information about changes in the number of jobs across the economy. Sustained increases or decreases can provide insight into labor-market conditions and broader economic momentum.",

  relationTags: [
    "labor_market",
    "employment",
    "jobs",
    "job_creation",
    "unemployment",
    "economic_growth",
    "economic_activity",
    "household_income",
    "business_cycle",
  ],

  status: "active",

  embedding: null,
};