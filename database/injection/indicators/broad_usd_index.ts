import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const broadUsdIndex: Indicator = {
  id: "broad_usd_index",
  name: "Nominal Broad U.S. Dollar Index",
  domain: "Macroeconomics",
  category: "Foreign Exchange",

  description:
    "A trade-weighted index measuring the value of the U.S. dollar against a broad group of foreign currencies. The index is reported daily, is not seasonally adjusted, and uses January 2006 = 100 as its reference period.",

  source: "FRED",
  seriesId: "DTWEXBGS",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Index Jan 2006=100",

  use:
    "Monitor changes in the broad nominal value of the U.S. dollar and assess foreign-exchange conditions, international financial conditions, trade competitiveness, and cross-border capital flows.",

  purpose:
    "Provide a broad measure of U.S. dollar strength against major trading-partner currencies for analyzing foreign-exchange conditions, monetary policy transmission, global financial conditions, and relationships between the dollar and other asset markets.",

  significance:
    "The broad U.S. dollar index provides a trade-weighted measure of changes in the dollar's value across a broad set of foreign currencies. Changes in the index can affect import prices, export competitiveness, international capital flows, commodity pricing, and global financial conditions.",

  relationTags: [
    "us_dollar",
    "usd",
    "foreign_exchange",
    "fx",
    "dollar_index",
    "trade_weighted",
    "global_financial_conditions",
    "monetary_policy",
    "import_prices",
    "export_competitiveness",
    "capital_flows",
    "commodity_prices",
  ],

  status: "active",

  embedding: null,
};