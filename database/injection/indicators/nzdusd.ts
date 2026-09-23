import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const nzdUsd: Indicator = {
  id: "nzd_usd",
  name: "NZD/USD",
  domain: "Foreign Exchange",
  category: "Major Currency Pairs",

  description:
    "The daily exchange rate between the New Zealand dollar and the U.S. dollar, representing the value of one New Zealand dollar in U.S. dollars. The series provides daily open, high, low, and closing exchange rates.",

  source: "Alpha Vantage",
  seriesId: "NZDUSD",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, End of Day",
  nativeAggregation: "OHLC",
  unit: "USD per NZD",

  use:
    "Monitor NZD/USD movements and assess changes in New Zealand-U.S. monetary policy expectations, interest-rate differentials, currency strength, commodity and export conditions, Asia-Pacific economic activity, and global risk sentiment.",

  purpose:
    "Provide a market-based measure of the New Zealand dollar against the U.S. dollar for analyzing New Zealand currency strength, New Zealand-U.S. interest-rate differentials, trade and export conditions, and changes in global market risk appetite.",

  significance:
    "NZD/USD is a major foreign-exchange pair linking New Zealand and the United States. Changes in the exchange rate can reflect shifts in Reserve Bank of New Zealand and Federal Reserve policy expectations, interest rates, New Zealand's terms of trade and export prices, economic conditions in China and the Asia-Pacific region, capital flows, and global risk sentiment.",

  relationTags: [
    "nzd",
    "usd",
    "new_zealand_dollar",
    "us_dollar",
    "new_zealand",
    "united_states",
    "nzd_usd",
    "foreign_exchange",
    "currency_strength",
    "exchange_rate",
    "reserve_bank_of_new_zealand",
    "federal_reserve",
    "interest_rates",
    "monetary_policy",
    "interest_rate_differential",
    "terms_of_trade",
    "commodity_prices",
    "commodity_currency",
    "agriculture",
    "dairy",
    "agricultural_exports",
    "china",
    "asia_pacific",
    "trade",
    "capital_flows",
    "risk_sentiment",
    "global_markets",
  ],

  status: "active",

  embedding: null,
};