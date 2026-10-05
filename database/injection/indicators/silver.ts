import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const silver: Indicator = {
  id: "silver",
  name: "Silver",
  domain: "Commodities",
  category: "Precious Metals",

  description:
    "The daily market price of silver quoted in U.S. dollars per troy ounce, representing the prevailing value of silver in global commodity and financial markets.",

  source: "Alpha Vantage",
  seriesId: "SILVER",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Dollars per Troy Ounce",

  use:
    "Monitor silver prices and assess changes in industrial demand, economic activity, investment demand, monetary conditions, precious-metals sentiment, and demand from technology and clean-energy applications.",

  purpose:
    "Provide a market-based measure of silver prices for analyzing precious-metals markets, industrial activity, investment demand, economic conditions, and changes in the balance between financial and industrial drivers of commodity demand.",

  significance:
    "Silver has a dual role as both a precious metal and an industrial input, making its price sensitive to financial-market conditions as well as the global economic cycle. Demand from electronics, photovoltaics, automotive applications, power infrastructure, and other technologies connects silver prices to industrial activity, while investment demand and monetary conditions connect the metal to broader financial markets.",

  relationTags: [
  "silver",
  "precious_metals",
  "commodity",
  "silver_price",
  "troy_ounce",
  "us_dollar",
  "industrial_metals",
  "industrial_demand",
  "economic_activity",
  "economic_growth",
  "investment_demand",
  "monetary_policy",
  "interest_rates",
  "real_interest_rates",
  "inflation",
  ],

  status: "active",

  embedding: null,
};