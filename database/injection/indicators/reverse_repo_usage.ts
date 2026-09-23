import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const reverseRepoUsage: Indicator = {
  id: "reverse_repo_usage",
  name: "Reverse Repo Usage",
  domain: "Macroeconomics",
  category: "Money & Liquidity",

  description:
    "The aggregated daily amount of overnight reverse repurchase agreement transactions conducted by the Federal Reserve with eligible counterparties. The series is not seasonally adjusted and is reported in billions of U.S. dollars.",

  source: "FRED",
  seriesId: "RRPONTSYD",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Billions of U.S. Dollars",

  use:
    "Monitor usage of the Federal Reserve's overnight reverse repurchase facility and assess changes in short-term liquidity and money-market conditions.",

  purpose:
    "Provide a measure of overnight reverse repo activity for analyzing Federal Reserve open-market operations, money-market liquidity, reserve conditions, and changes in short-term financial conditions.",

  significance:
    "Reverse repo usage reflects the amount of funds placed into the Federal Reserve's overnight reverse repurchase facility by eligible counterparties. Changes in usage can provide information about money-market conditions, the distribution of liquidity, and the interaction between Federal Reserve operations and short-term interest rates.",

  relationTags: [
    "reverse_repo",
    "rrp",
    "federal_reserve",
    "monetary_policy",
    "liquidity",
    "money_markets",
    "bank_reserves",
    "financial_conditions",
    "short_term_rates",
  ],

  status: "active",

  embedding: null,
};