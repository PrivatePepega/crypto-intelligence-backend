import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const gold: Indicator = {
  id: "gold",
  name: "Gold",
  domain: "Commodities",
  category: "Precious Metals",

  description:
    "The daily market price of gold quoted in U.S. dollars per troy ounce, representing the prevailing value of gold in global commodity and financial markets.",

  source: "Alpha Vantage",
  seriesId: "GOLD",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Dollars per Troy Ounce",

  use:
    "Monitor gold prices and assess changes in inflation expectations, real interest rates, U.S. dollar conditions, geopolitical risk, market uncertainty, investment demand, and central-bank demand for gold.",

  purpose:
    "Provide a market-based measure of gold prices for analyzing precious-metals markets, monetary and financial conditions, inflation and interest-rate expectations, global risk sentiment, and demand for gold as a reserve and store-of-value asset.",

  significance:
    "Gold is a globally traded precious metal with a distinctive role as both a commodity and financial asset. Its price can respond to changes in real interest rates, the U.S. dollar, inflation, geopolitical and economic uncertainty, investor positioning, and central-bank demand. Gold therefore provides the intelligence system with a cross-market signal connecting commodities, monetary policy, financial conditions, and global risk.",

  relationTags: [
  "gold",
  "precious_metals",
  "commodity",
  "gold_price",
  "troy_ounce",
  "us_dollar",
  "real_interest_rates",
  "interest_rates",
  "monetary_policy",
  "inflation",
  "inflation_expectations",
  "federal_reserve",
  "treasury_yields",
  "financial_conditions",
  "safe_haven",
  ],

  status: "active",

  embedding: null,
};