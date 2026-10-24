import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const m2MoneySupply: Indicator = {
  id: "m_two_money_supply",
  name: "M2 Money Supply",
  domain: "Macroeconomics",
  category: "Money & Liquidity",

  description:
    "A broad measure of the U.S. money supply consisting of currency and deposits and other liquid assets included in the Federal Reserve's M2 monetary aggregate. The series is seasonally adjusted and reported in billions of dollars.",

  source: "FRED",
  seriesId: "M2SL",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Billions of Dollars",
  historicalTimeUnit: "m",

  use: "Monitor changes in the quantity of money circulating through the U.S. financial system and assess changes in liquidity and monetary conditions.",

  purpose:
    "Provide a broad measure of the U.S. money supply for analyzing monetary conditions, liquidity, financial activity, and relationships between money growth and broader economic conditions.",

  significance:
    "M2 provides a broad measure of money and liquid deposits available within the U.S. financial system. Changes in M2 can provide information about shifts in monetary and liquidity conditions and can be analyzed alongside inflation, interest rates, credit, and economic activity.",

  relationTags: [
    "money_supply",
    "m2",
    "liquidity",
    "monetary_conditions",
    "monetary_policy",
    "banking",
    "credit",
    "inflation",
    "financial_conditions",
    "economic_activity",
  ],

  status: "active",

  embedding: null,
};
