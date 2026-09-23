import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const realBroadUsdIndex: Indicator = {
  id: "real_broad_usd_index",
  name: "Real Broad U.S. Dollar Index",
  domain: "Macroeconomics",
  category: "Foreign Exchange",

  description:
    "A trade-weighted index measuring the inflation-adjusted value of the U.S. dollar against a broad group of foreign currencies. The index is reported monthly, is not seasonally adjusted, and uses January 2006 = 100 as its reference period.",

  source: "FRED",
  seriesId: "RTWEXBGS",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Index Jan 2006=100",

  use:
    "Monitor changes in the inflation-adjusted value of the U.S. dollar and assess international price competitiveness, trade conditions, and global financial conditions.",

  purpose:
    "Provide a broad measure of the real, trade-weighted value of the U.S. dollar for analyzing exchange-rate competitiveness, international trade conditions, inflation-adjusted currency valuation, and relationships between the dollar and global economic conditions.",

  significance:
    "The real broad dollar index accounts for relative price-level differences in addition to exchange-rate movements. Changes in the index can provide information about the inflation-adjusted competitiveness of U.S. goods and services and the broader international financial position of the dollar.",

  relationTags: [
    "us_dollar",
    "usd",
    "foreign_exchange",
    "fx",
    "real_dollar",
    "dollar_index",
    "trade_weighted",
    "trade_competitiveness",
    "global_financial_conditions",
    "international_trade",
    "inflation",
    "exchange_rates",
  ],

  status: "active",

  embedding: null,
};