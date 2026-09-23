import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const investmentGradeCreditSpread: Indicator = {
  id: "investment_grade_credit_spread",
  name: "Investment Grade Credit Spread",
  domain: "Macroeconomics",
  category: "Financial Markets",

  description:
    "The ICE BofA U.S. Corporate Index Option-Adjusted Spread, measuring the spread between investment-grade U.S. corporate bonds and a comparable Treasury yield curve after adjusting for embedded options. The series is reported as a daily closing value and is not seasonally adjusted.",

  source: "FRED",
  seriesId: "BAMLC0A0CM",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily, Close",
  nativeAggregation: "none",
  unit: "Percent",

  use:
    "Monitor credit-market conditions and changes in the compensation investors demand for holding investment-grade corporate debt relative to U.S. Treasury securities.",

  purpose:
    "Provide a market-based measure of investment-grade corporate credit spreads for analyzing credit risk, financial conditions, investor risk pricing, and changes in corporate bond markets.",

  significance:
    "The investment-grade credit spread reflects the additional yield demanded by investors for investment-grade corporate debt relative to a Treasury reference curve. Changes in the spread can provide information about shifts in perceived credit risk, risk appetite, and broader financial-market conditions.",

  relationTags: [
    "credit_spreads",
    "investment_grade",
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