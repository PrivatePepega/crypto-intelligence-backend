import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const federalFundsRate: Indicator = {
  id: "federal_funds_rate",
  name: "Federal Funds Rate",
  domain: "Macroeconomics",
  category: "Monetary Policy",

  description:
    "The effective interest rate at which U.S. depository institutions lend federal funds to one another overnight. It is a market-determined rate influenced by the Federal Reserve's monetary policy framework and target range.",

  source: "FRED",
  seriesId: "DFF",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, 7-Day",
  nativeAggregation: "average",
  unit: "Percent",
  historicalTimeUnit: "m",

  use: "Monitor the stance and transmission of U.S. monetary policy and assess changes in short-term interest rates, liquidity, financial conditions, and broader economic activity.",

  purpose:
    "Provide a core measure of short-term U.S. interest rates for monetary policy analysis, financial condition analysis, and cross-indicator interpretation within the intelligence system.",

  significance:
    "The federal funds rate is a central short-term interest rate in the U.S. financial system. Changes in the rate influence other short-term rates and indirectly affect borrowing costs, financial conditions, economic activity, and asset markets.",

  relationTags: [
    "monetary_policy",
    "interest_rates",
    "federal_reserve",
    "liquidity",
    "financial_conditions",
    "short_term_rates",
  ],

  status: "active",

  embedding: null,
};
