import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const naturalGas: Indicator = {
  id: "natural_gas",
  name: "Natural Gas",
  domain: "Commodities",
  category: "Energy",

  description:
    "The daily Henry Hub spot price of natural gas in U.S. dollars per million British thermal units (MMBtu), representing the benchmark price for natural gas delivered at Henry Hub in Louisiana.",

  source: "Alpha Vantage",
  seriesId: "NATURAL_GAS",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Dollars per Million BTU",

  use:
    "Monitor U.S. natural gas prices and assess changes in energy supply and demand, weather-driven consumption, electricity generation, storage conditions, industrial activity, and energy-related inflation.",

  purpose:
    "Provide a market-based measure of U.S. natural gas prices for analyzing domestic energy-market conditions, seasonal demand, electricity-generation costs, industrial energy demand, and changes in broader economic and inflationary conditions.",

  significance:
    "Natural gas is an important U.S. energy commodity used for electricity generation, residential and commercial heating, and industrial processes. Henry Hub prices respond to changes in production, storage, weather, pipeline and infrastructure conditions, and demand from power generation and industry. Natural gas prices therefore provide signals about U.S. energy-market tightness, seasonal conditions, electricity costs, and energy-related inflation.",

  relationTags: [
    "natural_gas",
    "henry_hub",
    "energy",
    "energy_markets",
    "natural_gas_price",
    "us_dollar",
    "united_states",
    "louisiana",
    "us_energy",
    "electricity_generation",
    "power_generation",
    "heating",
    "industrial_demand",
    "energy_demand",
    "energy_supply",
    "natural_gas_production",
    "natural_gas_storage",
    "weather",
    "seasonality",
    "winter_demand",
    "pipeline_infrastructure",
    "lng",
    "liquefied_natural_gas",
    "inflation",
    "energy_inflation",
    "commodity_prices",
    "economic_activity",
    "global_energy_markets",
  ],

  status: "active",

  embedding: null,
};