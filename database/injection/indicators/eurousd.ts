import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const eurUsd: Indicator = {
  id: "eur_usd",
  name: "EUR/USD",
  domain: "Foreign Exchange",
  category: "Major Currency Pairs",

  description:
    "The daily exchange rate between the euro and the U.S. dollar, representing the value of one euro in U.S. dollars. The series provides daily open, high, low, and closing exchange rates.",

  source: "Alpha Vantage",
  seriesId: "EURUSD",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, End of Day",
  nativeAggregation: "OHLC",
  unit: "USD per EUR",

  use:
    "Monitor EUR/USD movements and assess changes in euro-area and U.S. monetary policy expectations, interest-rate differentials, relative economic conditions, capital flows, trade conditions, and global market sentiment.",

  purpose:
    "Provide a market-based measure of the exchange rate between the euro and U.S. dollar for analyzing relative currency strength, ECB and Federal Reserve policy expectations, euro-area and U.S. interest-rate differentials, cross-border capital flows, and changes in global financial conditions.",

  significance:
    "EUR/USD is one of the world's most important foreign-exchange pairs, linking the euro area with the United States and their respective monetary systems. Changes in the exchange rate can reflect shifts in ECB and Federal Reserve policy expectations, relative economic growth and inflation, interest rates, international capital flows, trade conditions, and global risk sentiment. EUR/USD movements also influence euro-area import prices, inflation, and financial conditions.",

  relationTags: [
    "eur",
    "usd",
    "euro",
    "euro_dollar",
    "us_dollar",
    "euro_area",
    "united_states",
    "eur_usd",
    "foreign_exchange",
    "currency_strength",
    "exchange_rate",
    "european_central_bank",
    "ecb",
    "federal_reserve",
    "fed",
    "interest_rates",
    "monetary_policy",
    "interest_rate_differential",
    "inflation",
    "economic_growth",
    "capital_flows",
    "trade",
    "import_prices",
    "financial_conditions",
    "risk_sentiment",
    "global_markets",
    "international_currency",
    "reserve_currency",
  ],

  status: "active",

  embedding: null,
};