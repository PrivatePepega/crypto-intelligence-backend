import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const usdCad: Indicator = {
  id: "usd_cad",
  name: "USD/CAD",
  domain: "Foreign Exchange",
  category: "Major Currency Pairs",

  description:
    "The daily exchange rate between the U.S. dollar and Canadian dollar, representing the value of one U.S. dollar in Canadian dollars. The series provides daily open, high, low, and closing exchange rates.",

  source: "Alpha Vantage",
  seriesId: "USDCAD",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, End of Day",
  nativeAggregation: "OHLC",
  unit: "CAD per USD",

  use:
    "Monitor USD/CAD movements and assess changes in U.S.-Canadian monetary policy expectations, interest-rate differentials, Canadian dollar strength, commodity prices, energy markets, and North American financial conditions.",

  purpose:
    "Provide a market-based measure of the exchange rate between the U.S. dollar and Canadian dollar for analyzing relative currency strength, U.S.-Canadian interest-rate differentials, commodity-driven economic conditions, and changes in cross-border financial markets.",

  significance:
    "USD/CAD is a major foreign-exchange pair linking the United States and Canada. Changes in the exchange rate can reflect shifts in Federal Reserve and Bank of Canada policy expectations, interest rates, Canadian commodity prices and export conditions, particularly energy, trade flows, and broader North American economic and market conditions.",

  relationTags: [
  "usd",
  "cad",
  "us_dollar",
  "canadian_dollar",
  "united_states",
  "canada",
  "usd_cad",
  "foreign_exchange",
  "currency_strength",
  "exchange_rate",
  "federal_reserve",
  "bank_of_canada",
  "interest_rates",
  "monetary_policy",
  "interest_rate_differential",
  ],

  status: "active",

  embedding: null,
};