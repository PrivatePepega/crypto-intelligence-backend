import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const pce: Indicator = {
  id: "pce",
  name: "Personal Consumption Expenditures",
  domain: "Macroeconomics",
  category: "Consumer Spending",

  description:
    "A measure of spending by households on goods and services in the United States. The series is reported as a seasonally adjusted annual rate and expressed in billions of dollars.",

  source: "FRED",
  seriesId: "PCE",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Billions of Dollars",
  historicalTimeUnit: "m",

  use: "Monitor household consumption and changes in consumer spending, a major component of U.S. economic activity.",

  purpose:
    "Provide a broad measure of personal consumption expenditures for analyzing consumer demand, economic growth, household spending behavior, and broader economic conditions.",

  significance:
    "Personal consumption expenditures represent a major component of U.S. economic activity. Changes in consumer spending can provide information about household demand, economic momentum, and shifts in consumption patterns.",

  relationTags: [
    "consumer_spending",
    "consumer_demand",
    "economic_growth",
    "household_consumption",
    "economic_activity",
    "personal_income",
    "inflation",
  ],

  status: "active",

  embedding: null,
};
