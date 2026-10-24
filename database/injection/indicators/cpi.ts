import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cpi: Indicator = {
  id: "cpi",
  name: "Consumer Price Index",
  domain: "Macroeconomics",
  category: "Inflation",

  description:
    "A seasonally adjusted price index measuring changes in the prices paid by urban consumers for a broad basket of goods and services in the United States. The index is based on a reference period of 1982–1984 = 100.",

  source: "FRED",
  seriesId: "CPIAUCSL",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Index",
  historicalTimeUnit: "m",

  use: "Monitor changes in consumer prices and assess inflation and deflation across the broad basket of goods and services purchased by urban consumers.",

  purpose:
    "Provide a broad measure of changes in consumer prices for analyzing inflation trends, purchasing power, monetary policy, and economic conditions.",

  significance:
    "The CPI is one of the primary measures used to monitor consumer price changes in the U.S. Changes in the index can indicate shifts in inflationary or deflationary conditions and are relevant to monetary policy, household purchasing power, and economic analysis.",

  relationTags: [
    "inflation",
    "consumer_prices",
    "price_levels",
    "monetary_policy",
    "purchasing_power",
    "economic_conditions",
  ],

  status: "active",

  embedding: null,
};
