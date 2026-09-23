import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const corePce: Indicator = {
  id: "core_pce",
  name: "Core PCE Price Index",
  domain: "Macroeconomics",
  category: "Inflation",

  description:
    "A seasonally adjusted price index measuring changes in the prices paid for goods and services in the United States, excluding food and energy. The index is a chain-type measure with a reference period of 2017 = 100.",

  source: "FRED",
  seriesId: "PCEPILFE",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Index",

  use:
    "Monitor underlying consumer price trends while reducing the influence of volatile food and energy prices.",

  purpose:
    "Provide a broad measure of underlying consumer inflation for analyzing persistent price pressures, monetary policy, inflation expectations, and economic conditions.",

  significance:
    "The Core PCE Price Index is a major measure of underlying consumer price inflation in the United States. Excluding food and energy reduces the influence of volatile components and provides a broader measure of underlying price trends. The index is also used in macroeconomic analysis and monetary policy assessment.",

  relationTags: [
    "inflation",
    "core_inflation",
    "pce",
    "consumer_prices",
    "price_levels",
    "monetary_policy",
    "inflation_expectations",
    "consumer_spending",
    "economic_conditions",
  ],

  status: "active",

  embedding: null,
};