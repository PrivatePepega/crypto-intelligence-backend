import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const wti: Indicator = {
  id: "wti",
  name: "WTI Crude Oil",
  domain: "Commodities",
  category: "Energy",

  description:
    "The daily price of West Texas Intermediate crude oil in U.S. dollars per barrel. WTI is a light, sweet crude oil benchmark associated with physical crude traded and delivered at Cushing, Oklahoma.",

  source: "Alpha Vantage",
  seriesId: "WTI",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Dollars per Barrel",

  use:
    "Monitor U.S. crude oil prices and assess changes in global and domestic oil supply and demand, U.S. production, inventories, energy-market conditions, inflation pressures, economic activity, and geopolitical risks affecting oil markets.",

  purpose:
    "Provide a market-based measure of U.S. crude oil prices for analyzing energy-market conditions, petroleum supply and demand, U.S. production and inventories, inflationary pressures, and the relationship between oil markets and broader economic conditions.",

  significance:
    "WTI is a major crude oil benchmark and an important reference price for U.S. petroleum markets. Its price reflects changing expectations around crude oil supply and demand, U.S. production and inventories, refinery activity, transportation constraints, and global energy conditions. Because oil is a major input into transportation, manufacturing, and other economic activity, WTI movements can also provide signals about inflation and broader economic conditions.",

  relationTags: [
    "wti",
    "west_texas_intermediate",
    "crude_oil",
    "oil",
    "energy",
    "energy_markets",
    "oil_price",
    "us_dollar",
    "united_states",
    "united_states_oil",
    "cushing",
    "oklahoma",
    "us_production",
    "oil_production",
    "oil_inventories",
    "refinery_activity",
    "supply_and_demand",
    "global_oil_market",
    "inflation",
    "energy_inflation",
    "economic_activity",
    "geopolitical_risk",
    "commodity_prices",
    "global_markets",
  ],

  status: "active",

  embedding: null,
};