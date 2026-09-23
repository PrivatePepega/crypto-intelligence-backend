import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const highYieldCreditSpread: Indicator = {
  id: "high_yield_credit_spread",
  name: "High Yield Credit Spread",
  domain: "Macroeconomics",
  category: "Financial Markets",

  description:
    "The ICE BofA U.S. High Yield Index Option-Adjusted Spread, measuring the spread between below-investment-grade U.S. corporate bonds and a comparable Treasury yield curve after adjusting for embedded options. The series is reported as a daily closing value and is not seasonally adjusted.",

  source: "FRED",
  seriesId: "BAMLH0A0HYM2",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, Close",
  nativeAggregation: "none",
  unit: "Percent",

  use:
    "Monitor credit-market conditions and changes in the compensation investors demand for holding below-investment-grade corporate debt relative to U.S. Treasury securities.",

  purpose:
    "Provide a market-based measure of high-yield corporate credit spreads for analyzing credit risk, financial conditions, investor risk pricing, and changes in stress across corporate bond markets.",

  significance:
    "The high-yield credit spread reflects the additional yield demanded by investors for below-investment-grade corporate debt relative to a Treasury reference curve. Changes in the spread can provide information about shifts in perceived credit risk, risk appetite, and broader financial-market conditions.",

  relationTags: [
    "credit_spreads",
    "high_yield",
    "corporate_bonds",
    "credit_risk",
    "financial_conditions",
    "financial_markets",
    "risk_sentiment",
    "risk_premium",
    "corporate_credit",
  ],

  status: "active",

  embedding: null,
};