import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const copper: Indicator = {
  id: "copper",
  name: "Copper",
  domain: "Commodities",
  category: "Industrial Metals",

  description:
    "The monthly global price of copper quoted in U.S. dollars per metric ton, representing the market value of copper across international commodity markets.",

  source: "Alpha Vantage",
  seriesId: "COPPER",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Dollars per Metric Ton",

  use:
    "Monitor global copper prices and assess changes in industrial demand, manufacturing activity, construction, infrastructure investment, electrification, global economic growth, and copper supply conditions.",

  purpose:
    "Provide a market-based measure of global copper prices for analyzing industrial commodity markets, manufacturing and construction activity, infrastructure investment, global economic conditions, and changes in the balance between copper supply and demand.",

  significance:
    "Copper is a widely used industrial metal whose demand is closely connected to manufacturing, construction, electrical infrastructure, power systems, and economic activity. Changes in copper prices can reflect shifts in global industrial demand, infrastructure investment, mine and refinery supply, inventories, and expectations for economic growth. Copper therefore provides a useful cross-market signal for the global industrial cycle and the expansion of electrification and energy infrastructure.",

  relationTags: [
  "copper",
  "industrial_metals",
  "commodity",
  "copper_price",
  "us_dollar",
  "global_copper_market",
  "industrial_demand",
  "economic_activity",
  "economic_growth",
  "global_growth",
  "manufacturing",
  "construction",
  "infrastructure",
  "infrastructure_investment",
  "electrification",
  ],

  status: "active",

  embedding: null,
};