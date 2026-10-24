import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const aluminum: Indicator = {
  id: "aluminum",
  name: "Aluminum",
  domain: "Commodities",
  category: "Industrial Metals",

  description:
    "The monthly global price of aluminum quoted in U.S. dollars per metric ton, representing the market value of aluminum across international commodity markets.",

  source: "Alpha Vantage",
  seriesId: "ALUMINUM",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Dollars per Metric Ton",
  historicalTimeUnit: "m",

  use: "Monitor global aluminum prices and assess changes in manufacturing, construction, transportation, packaging, electricity demand, global industrial activity, and aluminum supply conditions.",

  purpose:
    "Provide a market-based measure of global aluminum prices for analyzing industrial commodity markets, manufacturing and construction activity, infrastructure and transportation demand, energy conditions, and changes in the global balance between aluminum supply and demand.",

  significance:
    "Aluminum is a widely used industrial metal valued for its low weight, durability, and conductivity. Its price is influenced by global manufacturing and construction activity, transportation and packaging demand, production capacity, inventories, and energy costs because primary aluminum production is highly electricity intensive. Aluminum prices therefore provide signals about the global industrial cycle, commodity supply conditions, and energy-related production pressures.",

  relationTags: [
    "aluminum",
    "industrial_metals",
    "commodity",
    "aluminum_price",
    "us_dollar",
    "global_aluminum_market",
    "industrial_demand",
    "economic_activity",
    "economic_growth",
    "global_growth",
    "manufacturing",
    "construction",
    "infrastructure",
    "transportation",
    "automotive",
  ],

  status: "active",

  embedding: null,
};
