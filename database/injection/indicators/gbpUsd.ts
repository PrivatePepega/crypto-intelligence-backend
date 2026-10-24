import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const gbpUsd: Indicator = {
  id: "gbp_usd",
  name: "GBP/USD",
  domain: "Foreign Exchange",
  category: "Major Currency Pairs",

  description:
    "The daily exchange rate between the British pound sterling and the U.S. dollar, representing the value of one British pound in U.S. dollars. The series provides daily open, high, low, and closing exchange rates.",

  source: "Alpha Vantage",
  seriesId: "GBPUSD",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, End of Day",
  nativeAggregation: "OHLC",
  unit: "USD per GBP",
  historicalTimeUnit: "d",

  use: "Monitor GBP/USD movements and assess changes in UK-U.S. monetary policy expectations, currency strength, interest-rate differentials, and broader global financial conditions.",

  purpose:
    "Provide a market-based measure of the exchange rate between the British pound and U.S. dollar for analyzing relative currency strength, UK-U.S. interest-rate differentials, monetary policy expectations, and cross-border financial conditions.",

  significance:
    "GBP/USD is a major foreign-exchange pair linking the United Kingdom and United States. Changes in the exchange rate can reflect shifts in relative economic conditions, monetary policy expectations, interest rates, capital flows, and market risk sentiment.",

  relationTags: [
    "gbp",
    "usd",
    "british_pound",
    "us_dollar",
    "united_kingdom",
    "united_states",
    "gbp_usd",
    "foreign_exchange",
    "currency_strength",
    "exchange_rate",
    "bank_of_england",
    "federal_reserve",
    "interest_rates",
    "monetary_policy",
    "interest_rate_differential",
  ],

  status: "active",

  embedding: null,
};
