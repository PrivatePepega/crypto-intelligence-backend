import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const advancedEconomyUsdIndex: Indicator = {
  id: "advanced_economy_usd_index",
  name: "Nominal Advanced Foreign Economies U.S. Dollar Index",
  domain: "Macroeconomics",
  category: "Foreign Exchange",

  description:
    "A trade-weighted index measuring the nominal value of the U.S. dollar against currencies of advanced foreign economies. The index is reported daily, is not seasonally adjusted, and uses January 2006 = 100 as its reference period.",

  source: "FRED",
  seriesId: "DTWEXAFEGS",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Index Jan 2006=100",

  use:
    "Monitor changes in the U.S. dollar's nominal value against currencies of advanced foreign economies and assess exchange-rate conditions, international financial conditions, and cross-border economic relationships.",

  purpose:
    "Provide a trade-weighted measure of the U.S. dollar against advanced-economy currencies for analyzing foreign-exchange conditions, relative currency movements, monetary policy transmission, and international financial conditions.",

  significance:
    "The index isolates movements in the U.S. dollar relative to currencies of advanced foreign economies using trade-weighted exchange rates. Changes can provide information about dollar strength, international capital conditions, trade relationships, and differences in monetary and economic conditions across major advanced economies.",

  relationTags: [
    "us_dollar",
    "usd",
    "foreign_exchange",
    "fx",
    "dollar_index",
    "trade_weighted",
    "advanced_economies",
    "global_financial_conditions",
    "monetary_policy",
    "exchange_rates",
    "international_trade",
    "capital_flows",
  ],

  status: "active",

  embedding: null,
};