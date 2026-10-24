import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const retailSales: Indicator = {
  id: "retail_sales",
  name: "Retail Sales",
  domain: "Macroeconomics",
  category: "Consumer Spending",

  description:
    "Seasonally adjusted monthly sales for U.S. retail trade and food services, reported in millions of dollars. The most recent observation is an advance estimate based on a subsample of firms and is subject to revision.",

  source: "FRED",
  seriesId: "RSAFS",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Millions of Dollars",
  historicalTimeUnit: "m",

  use: "Monitor consumer spending activity through changes in retail trade and food-service sales and identify shifts in consumer demand and economic momentum.",

  purpose:
    "Provide a timely measure of nominal retail and food-service sales for analyzing consumer demand, household spending, economic activity, and changes in consumption trends.",

  significance:
    "Retail sales provide a timely signal of consumer demand and economic activity. Changes in sales can indicate shifts in household spending behavior and economic momentum, although the latest observation is an advance estimate and may be revised as more complete survey data become available.",

  relationTags: [
    "consumer_spending",
    "consumer_demand",
    "retail_sales",
    "household_consumption",
    "economic_activity",
    "economic_growth",
    "consumer_behavior",
    "economic_conditions",
  ],

  status: "active",

  embedding: null,
};
