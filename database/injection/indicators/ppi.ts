import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const ppi: Indicator = {
  id: "ppi",
  name: "Producer Price Index",
  domain: "Macroeconomics",
  category: "Inflation",

  description:
    "A monthly price index measuring changes in prices received by producers across all commodities in the United States. The index uses a reference period of 1982 = 100 and is not seasonally adjusted.",

  source: "FRED",
  seriesId: "PPIACO",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Index",
  historicalTimeUnit: "m",

  use: "Monitor changes in prices received by producers across the broad commodity economy and assess producer-level price pressures.",

  purpose:
    "Provide a broad measure of producer price movements for analyzing upstream inflation pressures, commodity pricing, production costs, and potential changes in consumer prices.",

  significance:
    "The Producer Price Index provides information about price changes at the producer level before goods and services reach consumers. Changes in producer prices can provide insight into upstream inflation pressures and changes in production costs.",

  relationTags: [
    "inflation",
    "producer_prices",
    "price_levels",
    "upstream_inflation",
    "production_costs",
    "commodity_prices",
    "consumer_prices",
    "economic_conditions",
  ],

  status: "active",

  embedding: null,
};
