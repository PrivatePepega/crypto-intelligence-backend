import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const usdJpy: Indicator = {
  id: "usd_jpy",
  name: "USD/JPY",
  domain: "Foreign Exchange",
  category: "Major Currency Pairs",

  description:
    "The daily exchange rate between the U.S. dollar and Japanese yen, representing the value of one U.S. dollar in Japanese yen. The series provides daily open, high, low, and closing exchange rates.",

  source: "Alpha Vantage",
  seriesId: "USDJPY",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, End of Day",
  nativeAggregation: "OHLC",
  unit: "JPY per USD",

  use:
    "Monitor USD/JPY movements and assess changes in U.S.-Japan monetary policy expectations, currency strength, interest-rate differentials, and broader global financial conditions.",

  purpose:
    "Provide a market-based measure of the exchange rate between the U.S. dollar and Japanese yen for analyzing relative currency strength, U.S.-Japan interest-rate differentials, monetary policy expectations, and cross-border financial conditions.",

  significance:
    "USD/JPY is a major foreign-exchange pair linking the United States and Japan. Changes in the exchange rate can reflect shifts in relative economic conditions, Federal Reserve and Bank of Japan policy expectations, interest rates, capital flows, and global risk sentiment.",

  relationTags: [
    "usd",
    "jpy",
    "us_dollar",
    "japanese_yen",
    "united_states",
    "japan",
    "usd_jpy",
    "foreign_exchange",
    "currency_strength",
    "exchange_rate",
    "federal_reserve",
    "bank_of_japan",
    "interest_rates",
    "monetary_policy",
    "interest_rate_differential",
    "capital_flows",
    "risk_sentiment",
    "global_markets",
  ],

  status: "active",

  embedding: null,
};