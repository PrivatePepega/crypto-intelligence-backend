import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const realGdp: Indicator = {
  id: "real_gdp",
  name: "Real Gross Domestic Product",
  domain: "Macroeconomics",
  category: "Economic Growth",

  description:
    "The inflation-adjusted value of goods and services produced by labor and property located in the United States. The series is seasonally adjusted at an annual rate and reported in billions of chained 2017 dollars.",

  source: "FRED",
  seriesId: "GDPC1",

  nativeTimeUnit: "quarter",
  nativeFrequency: "Quarterly",
  nativeAggregation: "average",
  unit: "Billions of Chained 2017 Dollars",

  use:
    "Monitor the inflation-adjusted level of U.S. economic output and assess changes in overall economic activity and growth.",

  purpose:
    "Provide a broad measure of real U.S. economic output for analyzing economic growth, business-cycle conditions, productivity, and changes in aggregate economic activity.",

  significance:
    "Real GDP measures the inflation-adjusted value of goods and services produced in the U.S. economy. Changes in real GDP provide a broad measure of economic expansion or contraction and are central to assessing overall economic conditions and the business cycle.",

  relationTags: [
    "economic_growth",
    "real_gdp",
    "economic_activity",
    "business_cycle",
    "output",
    "aggregate_demand",
    "productivity",
    "macroeconomics",
  ],

  status: "active",

  embedding: null,
};