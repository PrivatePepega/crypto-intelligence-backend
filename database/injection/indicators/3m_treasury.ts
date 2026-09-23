import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const threeMonthTreasury: Indicator = {
  id: "3m_treasury",
  name: "3-Month Treasury Bill Rate",
  domain: "Macroeconomics",
  category: "Interest Rates",

  description:
    "The secondary market interest rate for U.S. Treasury bills with a three-month maturity, quoted on a discount basis. The series is reported daily and is not seasonally adjusted.",

  source: "FRED",
  seriesId: "DTB3",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Percent",

  use:
    "Monitor short-term U.S. Treasury interest rates and assess changes in money-market conditions, monetary policy expectations, and short-term government borrowing costs.",

  purpose:
    "Provide a high-frequency measure of the three-month Treasury bill rate for analyzing short-term interest rates, monetary policy transmission, liquidity conditions, and the front end of the U.S. yield curve.",

  significance:
    "The three-month Treasury bill rate is a key short-term interest-rate benchmark and reflects market pricing for very short-term U.S. government debt. Changes in the rate can provide information about short-term monetary and financial conditions and expectations surrounding Federal Reserve policy.",

  relationTags: [
    "treasury_bills",
    "treasury_yields",
    "interest_rates",
    "short_term_rates",
    "money_markets",
    "monetary_policy",
    "liquidity",
    "yield_curve",
    "financial_conditions",
    "government_bonds",
    "market_expectations",
  ],

  status: "active",

  embedding: null,
};