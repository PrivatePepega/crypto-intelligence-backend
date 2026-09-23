import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const unemploymentRate: Indicator = {
  id: "unemployment_rate",
  name: "Unemployment Rate",
  domain: "Macroeconomics",
  category: "Labor Market",

  description:
    "The percentage of the U.S. civilian labor force that is unemployed. This series represents the U-3 measure of labor underutilization and is seasonally adjusted.",

  source: "FRED",
  seriesId: "UNRATE",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "average",
  unit: "Percent",

  use:
    "Monitor labor market conditions and changes in the share of the labor force that is unemployed.",

  purpose:
    "Provide a core measure of U.S. labor market conditions for analyzing employment, economic activity, monetary policy, household conditions, and changes in the business cycle.",

  significance:
    "The unemployment rate is a widely used measure of labor market conditions and economic slack. Changes in unemployment can provide information about labor-market strength, household income conditions, economic activity, and the broader business cycle.",

  relationTags: [
    "labor_market",
    "unemployment",
    "employment",
    "economic_conditions",
    "economic_growth",
    "economic_activity",
    "monetary_policy",
    "business_cycle",
  ],

  status: "active",

  embedding: null,
};