import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const realGdpGrowth: Indicator = {
  id: "real_gdp_growth",
  name: "Real GDP Growth",
  domain: "Macroeconomics",
  category: "Economic Growth",

  description:
    "The quarterly percentage change in inflation-adjusted U.S. gross domestic product from the preceding period, reported at an annual rate. The series is seasonally adjusted and measures changes in real economic output.",

  source: "FRED",
  seriesId: "A191RL1Q225SBEA",

  nativeTimeUnit: "quarter",
  nativeFrequency: "Quarterly",
  nativeAggregation: "none",
  unit: "Percent Change at Annual Rate",
  historicalTimeUnit: "q",

  use: "Monitor the pace of change in inflation-adjusted U.S. economic output and identify periods of economic expansion, slowing growth, or contraction.",

  purpose:
    "Provide a published measure of quarterly real GDP growth for analyzing economic momentum, business-cycle conditions, and changes in aggregate economic activity.",

  significance:
    "Real GDP growth measures changes in inflation-adjusted economic output and provides a broad indicator of economic momentum. Changes in the growth rate can help identify shifts between stronger and weaker periods of economic activity and changes in the business cycle.",

  relationTags: [
    "economic_growth",
    "real_gdp",
    "economic_activity",
    "business_cycle",
    "output",
    "economic_momentum",
    "macroeconomics",
  ],

  status: "active",

  embedding: null,
};
