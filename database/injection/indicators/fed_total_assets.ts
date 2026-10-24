import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const fedTotalAssets: Indicator = {
  id: "fed_total_assets",
  name: "Federal Reserve Total Assets",
  domain: "Macroeconomics",
  category: "Money & Liquidity",

  description:
    "The total assets held by the Federal Reserve, reported as a weekly level measured as of Wednesday and expressed in millions of U.S. dollars. The series is not seasonally adjusted.",

  source: "FRED",
  seriesId: "WALCL",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly, As of Wednesday",
  nativeAggregation: "none",
  unit: "Millions of U.S. Dollars",
  historicalTimeUnit: "m",

  use: "Monitor changes in the size of the Federal Reserve's balance sheet and assess shifts in monetary liquidity and central-bank asset holdings.",

  purpose:
    "Provide a broad measure of Federal Reserve total assets for analyzing balance-sheet policy, liquidity conditions, quantitative easing or tightening, and changes in the U.S. monetary environment.",

  significance:
    "Federal Reserve total assets provide a high-frequency measure of the size of the central bank's balance sheet. Changes can reflect movements in securities holdings, lending facilities, and other Federal Reserve assets and can therefore provide context for changes in monetary and financial conditions.",

  relationTags: [
    "federal_reserve",
    "central_bank",
    "monetary_policy",
    "balance_sheet",
    "liquidity",
    "money_supply",
    "quantitative_easing",
    "quantitative_tightening",
    "financial_conditions",
  ],

  status: "active",

  embedding: null,
};
