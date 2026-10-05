import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const brent: Indicator = {
  id: "brent",
  name: "Brent Crude Oil",
  domain: "Commodities",
  category: "Energy",

  description:
    "The daily price of Brent crude oil quoted in U.S. dollars per barrel. Brent is a major international crude oil benchmark used to represent global oil-market pricing.",

  source: "Alpha Vantage",
  seriesId: "BRENT",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Dollars per Barrel",

  use:
    "Monitor global crude oil prices and assess changes in international oil supply and demand, producer activity, geopolitical disruptions, energy-market conditions, inflation pressures, and global economic activity.",

  purpose:
    "Provide a market-based measure of internationally relevant crude oil prices for analyzing global energy-market conditions, oil supply and demand, geopolitical disruptions, inflationary pressures, and changes in the global economic environment.",

  significance:
    "Brent is a major global crude oil benchmark and provides a broad signal of international energy-market conditions. Its price can respond to changes in global oil supply and demand, production disruptions, geopolitical events, trade and transportation conditions, and expectations for economic activity. Brent therefore connects energy markets with inflation, geopolitics, trade, and the broader global economy.",

  relationTags: [
  "brent",
  "brent_crude",
  "crude_oil",
  "oil",
  "energy",
  "energy_markets",
  "oil_price",
  "us_dollar",
  "north_sea",
  "global_oil_market",
  "international_oil",
  "opec",
  "oil_production",
  "oil_supply",
  "oil_demand",
  ],

  status: "active",

  embedding: null,
};