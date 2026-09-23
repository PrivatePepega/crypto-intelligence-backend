import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const emergingMarketUsdIndex: Indicator = {
  id: "emerging_market_usd_index",
  name: "Nominal Emerging Market Economies U.S. Dollar Index",
  domain: "Macroeconomics",
  category: "Foreign Exchange",

  description:
    "A trade-weighted index measuring the nominal value of the U.S. dollar against currencies of emerging market economies. The index is reported daily, is not seasonally adjusted, and uses January 2006 = 100 as its reference period.",

  source: "FRED",
  seriesId: "DTWEXEMEGS",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Index Jan 2006=100",

  use:
    "Monitor changes in the U.S. dollar's nominal value against currencies of emerging market economies and assess foreign-exchange conditions, global financial conditions, capital flows, and international economic relationships.",

  purpose:
    "Provide a trade-weighted measure of the U.S. dollar against emerging-market currencies for analyzing foreign-exchange conditions, international financial conditions, monetary policy transmission, and changes in cross-border capital flows.",

  significance:
    "The index measures movements in the U.S. dollar relative to currencies of emerging market economies using trade-weighted exchange rates. Changes in the index can provide information about dollar strength, emerging-market financial conditions, international capital flows, and differences in monetary and economic conditions across emerging markets.",

  relationTags: [
    "us_dollar",
    "usd",
    "foreign_exchange",
    "fx",
    "dollar_index",
    "trade_weighted",
    "emerging_markets",
    "global_financial_conditions",
    "monetary_policy",
    "exchange_rates",
    "capital_flows",
    "international_trade",
    "risk_sentiment",
  ],

  status: "active",

  embedding: null,
};