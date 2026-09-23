import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const coreCpi: Indicator = {
  id: "core_cpi",
  name: "Core Consumer Price Index",
  domain: "Macroeconomics",
  category: "Inflation",

  description:
    "A seasonally adjusted price index measuring changes in the prices paid by urban consumers for a broad basket of goods and services, excluding food and energy. The index uses a reference period of 1982–1984 = 100.",

  source: "FRED",
  seriesId: "CPILFESL",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Index",

  use:
    "Monitor underlying consumer price trends while reducing the influence of the relatively volatile food and energy components.",

  purpose:
    "Provide a measure of underlying consumer price movements for analyzing persistent inflation trends, monetary policy, and broader economic conditions.",

  significance:
    "Core CPI is widely used in economic analysis because excluding food and energy can reduce the influence of short-term volatility in those components. Changes in core prices provide information about broader and potentially more persistent consumer price pressures.",

  relationTags: [
    "inflation",
    "core_inflation",
    "consumer_prices",
    "price_levels",
    "monetary_policy",
    "purchasing_power",
    "economic_conditions",
  ],

  status: "active",

  embedding: null,
};