import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const tenYearTreasuryYield: Indicator = {
  id: "ten_year_treasury_yield",
  name: "10-Year Treasury Yield",
  domain: "Macroeconomics",
  category: "Interest Rates",

  description:
    "The market yield on U.S. Treasury securities with a constant maturity of ten years, quoted on an investment basis. It reflects market pricing for longer-term U.S. government borrowing and expectations about future economic and financial conditions.",

  source: "FRED",
  seriesId: "DGS10",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Percent",

  use:
    "Monitor long-term U.S. interest rates, Treasury market conditions, financial conditions, inflation and growth expectations, and changes in the cost of government borrowing.",

  purpose:
    "Provide a market-based measure of the ten-year point on the U.S. Treasury yield curve for analyzing long-term interest rates, economic expectations, monetary policy transmission, and financial market conditions.",

  significance:
    "The 10-year Treasury yield is a major benchmark for U.S. long-term interest rates and influences pricing across financial markets. Changes in the yield can reflect shifts in expectations for inflation, economic growth, monetary policy, and demand for government securities.",

  relationTags: [
    "treasury_yields",
    "interest_rates",
    "yield_curve",
    "monetary_policy",
    "inflation_expectations",
    "economic_growth",
    "financial_conditions",
    "government_bonds",
    "market_expectations",
  ],

  status: "active",

  embedding: null,
};