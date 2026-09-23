import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const personalIncome: Indicator = {
  id: "personal_income",
  name: "Personal Income",
  domain: "Macroeconomics",
  category: "Consumer Spending",

  description:
    "The income received by individuals in the United States from labor, property, and capital, together with net current transfer payments received from businesses and government. The series is reported as a seasonally adjusted annual rate in billions of dollars.",

  source: "FRED",
  seriesId: "PI",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "average",
  unit: "Billions of Dollars",

  use:
    "Monitor changes in aggregate income received by households and assess household financial conditions, consumer spending capacity, and economic activity.",

  purpose:
    "Provide a broad measure of personal income for analyzing household income conditions, consumer demand, savings, and changes in overall economic activity.",

  significance:
    "Personal income captures income received by individuals from labor, assets, and transfers. Changes in personal income can provide information about household purchasing capacity and economic conditions and can help explain changes in consumer spending.",

  relationTags: [
    "personal_income",
    "household_income",
    "consumer_spending",
    "consumer_demand",
    "labor_market",
    "wages",
    "economic_activity",
    "economic_growth",
    "household_finances",
    "transfers",
  ],

  status: "active",

  embedding: null,
};