import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const usdChf: Indicator = {
  id: "usd_chf",
  name: "USD/CHF",
  domain: "Foreign Exchange",
  category: "Major Currency Pairs",

  description:
    "The daily exchange rate between the U.S. dollar and Swiss franc, representing the value of one U.S. dollar in Swiss francs. The series provides daily open, high, low, and closing exchange rates.",

  source: "Alpha Vantage",
  seriesId: "USDCHF",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, End of Day",
  nativeAggregation: "OHLC",
  unit: "CHF per USD",

  use:
    "Monitor USD/CHF movements and assess changes in U.S.-Swiss monetary policy expectations, currency strength, interest-rate differentials, and global risk sentiment.",

  purpose:
    "Provide a market-based measure of the exchange rate between the U.S. dollar and Swiss franc for analyzing relative currency strength, U.S.-Swiss interest-rate differentials, monetary policy expectations, and cross-border financial conditions.",

  significance:
    "USD/CHF is a major foreign-exchange pair linking the United States and Switzerland. Changes in the exchange rate can reflect shifts in relative economic conditions, Federal Reserve and Swiss National Bank policy expectations, interest rates, capital flows, and demand for the Swiss franc during changes in global risk conditions.",

  relationTags: [
  "usd",
  "chf",
  "us_dollar",
  "swiss_franc",
  "united_states",
  "switzerland",
  "usd_chf",
  "foreign_exchange",
  "currency_strength",
  "exchange_rate",
  "federal_reserve",
  "swiss_national_bank",
  "interest_rates",
  "monetary_policy",
  "interest_rate_differential",
  ],

  status: "active",

  embedding: null,
};