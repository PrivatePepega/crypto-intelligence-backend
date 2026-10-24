import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const reserveBalances: Indicator = {
  id: "reserve_balances",
  name: "Reserve Balances",
  domain: "Macroeconomics",
  category: "Money & Liquidity",

  description:
    "The average level of reserve balances held by depository institutions at Federal Reserve Banks during the week ending Wednesday. The series is not seasonally adjusted and is reported in millions of U.S. dollars.",

  source: "FRED",
  seriesId: "WRESBAL",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly, Ending Wednesday",
  nativeAggregation: "average",
  unit: "Millions of U.S. Dollars",
  historicalTimeUnit: "m",

  use: "Monitor the level of reserve balances held by depository institutions at Federal Reserve Banks and assess changes in banking-system liquidity and monetary conditions.",

  purpose:
    "Provide a measure of reserve balances within the U.S. banking system for analyzing Federal Reserve balance-sheet operations, liquidity conditions, and the implementation of monetary policy.",

  significance:
    "Reserve balances represent funds that depository institutions hold at Federal Reserve Banks. Changes in reserve balances provide information about banking-system liquidity and can help interpret the effects of Federal Reserve balance-sheet operations and broader monetary conditions.",

  relationTags: [
    "reserve_balances",
    "bank_reserves",
    "federal_reserve",
    "monetary_policy",
    "liquidity",
    "banking_system",
    "money_supply",
    "financial_conditions",
  ],

  status: "active",

  embedding: null,
};
