import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const initialJoblessClaims: Indicator = {
  id: "initial_jobless_claims",
  name: "Initial Jobless Claims",
  domain: "Macroeconomics",
  category: "Labor Market",

  description:
    "The number of initial claims for unemployment insurance filed by individuals following separation from an employer. The series is seasonally adjusted and reported weekly, with observations representing the week ending Saturday.",

  source: "FRED",
  seriesId: "ICSA",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly, Ending Saturday",
  nativeAggregation: "average",
  unit: "Number",

  use:
    "Monitor new unemployment insurance claims and identify changes in labor-market conditions, layoffs, and emerging weakness or strength in employment.",

  purpose:
    "Provide a high-frequency measure of new unemployment insurance claims for analyzing labor-market conditions and detecting changes in employment trends before slower monthly indicators are released.",

  significance:
    "Initial jobless claims provide a timely signal of new unemployment following job separations. Sustained changes in claims can provide information about labor-market conditions, layoffs, and shifts in economic activity.",

  relationTags: [
    "labor_market",
    "unemployment",
    "jobless_claims",
    "layoffs",
    "employment",
    "labor_market_conditions",
    "economic_conditions",
    "business_cycle",
    "high_frequency",
  ],

  status: "active",

  embedding: null,
};