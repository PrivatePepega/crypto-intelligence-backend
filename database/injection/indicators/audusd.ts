import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const audUsd: Indicator = {
  id: "aud_usd",
  name: "AUD/USD",
  domain: "Foreign Exchange",
  category: "Major Currency Pairs",

  description:
    "The daily exchange rate between the Australian dollar and the U.S. dollar, representing the value of one Australian dollar in U.S. dollars. The series provides daily open, high, low, and closing exchange rates.",

  source: "Alpha Vantage",
  seriesId: "AUDUSD",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, End of Day",
  nativeAggregation: "OHLC",
  unit: "USD per AUD",

  use:
    "Monitor AUD/USD movements and assess changes in Australian-U.S. monetary policy expectations, interest-rate differentials, commodity prices, terms of trade, China-linked economic conditions, and global risk sentiment.",

  purpose:
    "Provide a market-based measure of the Australian dollar against the U.S. dollar for analyzing Australian currency strength, Australia-U.S. interest-rate differentials, commodity-driven trade conditions, and changes in global market risk appetite.",

  significance:
    "AUD/USD is a major foreign-exchange pair connecting Australia and the United States and is closely associated with Australia's commodity-export economy. Changes in the exchange rate can reflect shifts in relative monetary policy expectations and interest rates, commodity prices and Australia's terms of trade, Chinese economic conditions, capital flows, and global risk sentiment.",

  relationTags: [
    "aud",
    "usd",
    "australian_dollar",
    "us_dollar",
    "australia",
    "united_states",
    "aud_usd",
    "foreign_exchange",
    "currency_strength",
    "exchange_rate",
    "reserve_bank_of_australia",
    "federal_reserve",
    "interest_rates",
    "monetary_policy",
    "interest_rate_differential",
    "commodity_prices",
    "commodity_currency",
    "terms_of_trade",
    "iron_ore",
    "natural_gas",
    "china",
    "chinese_economy",
    "capital_flows",
    "risk_sentiment",
    "global_markets",
  ],

  status: "active",

  embedding: null,
};