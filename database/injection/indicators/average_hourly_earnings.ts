import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const averageHourlyEarnings: Indicator = {
  id: "average_hourly_earnings",
  name: "Average Hourly Earnings",
  domain: "Macroeconomics",
  category: "Labor Market",

  description:
    "The average gross hourly earnings of all private-sector employees in the United States, including premium pay for overtime and late-shift work. The series is seasonally adjusted and reported in dollars per hour.",

  source: "FRED",
  seriesId: "CES0500000003",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "average",
  unit: "Dollars per Hour",

  use:
    "Monitor changes in average hourly earnings and assess wage pressures, household income conditions, labor-market trends, and potential inflationary pressures.",

  purpose:
    "Provide a broad measure of average hourly earnings in the private sector for analyzing labor-market conditions, wage growth, household income, inflation pressures, and economic activity.",

  significance:
    "Average hourly earnings provide information about changes in the average hourly compensation received by private-sector workers. Changes can help identify wage pressures and their potential relationship with consumer spending and inflation, although movements can also reflect changes in the composition of workers rather than changes in individual workers' earnings.",

  relationTags: [
    "labor_market",
    "wages",
    "earnings",
    "employment",
    "household_income",
    "inflation",
    "wage_growth",
    "consumer_spending",
    "economic_conditions",
  ],

  status: "active",

  embedding: null,
};