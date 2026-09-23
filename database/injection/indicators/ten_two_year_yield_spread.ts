import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const tenTwoYearYieldSpread: Indicator = {
  id: "ten_two_year_yield_spread",
  name: "10-Year / 2-Year Treasury Yield Spread",
  domain: "Macroeconomics",
  category: "Interest Rates",

  description:
    "The difference between the 10-year and 2-year U.S. Treasury yields, measured in percentage points. It represents the slope of an important segment of the Treasury yield curve.",

  source: "FRED",
  seriesId: "DGS10-DGS2",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "average",
  unit: "Percentage Points",

  use:
    "Monitor the slope of the U.S. Treasury yield curve and identify changes in the relationship between longer-term and shorter-term interest rates.",

  purpose:
    "Provide a standardized measure of the 10-year versus 2-year Treasury yield differential for analyzing monetary policy expectations, economic conditions, and changes in the shape of the yield curve.",

  significance:
    "The 10-year/2-year yield spread provides information about changing expectations for interest rates and economic conditions. Changes in the spread can indicate shifts in the relative pricing of short- and longer-term Treasury securities and are useful for interpreting the broader yield curve.",

  relationTags: [
    "treasury_yields",
    "interest_rates",
    "yield_curve",
    "yield_curve_slope",
    "monetary_policy",
    "economic_growth",
    "recession_risk",
    "financial_conditions",
  ],

  status: "active",

  embedding: null,
};