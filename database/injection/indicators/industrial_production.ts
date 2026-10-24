import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const industrialProduction: Indicator = {
  id: "industrial_production",
  name: "Industrial Production",
  domain: "Macroeconomics",
  category: "Economic Activity",

  description:
    "A seasonally adjusted index measuring the real output of the U.S. industrial sector, including manufacturing, mining, and electric and gas utilities. The index uses a reference period of 2017 = 100.",

  source: "FRED",
  seriesId: "INDPRO",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "average",
  unit: "Index 2017=100",
  historicalTimeUnit: "m",

  use: "Monitor changes in U.S. industrial output and assess conditions across manufacturing, mining, and utility production.",

  purpose:
    "Provide a broad measure of industrial-sector activity for analyzing economic momentum, production trends, business conditions, and changes in the business cycle.",

  significance:
    "Industrial production provides information about real output in major industrial sectors of the U.S. economy. Changes in the index can help identify shifts in production activity and economic momentum, particularly within manufacturing and other industrial sectors.",

  relationTags: [
    "industrial_production",
    "economic_activity",
    "economic_growth",
    "manufacturing",
    "mining",
    "utilities",
    "production",
    "business_cycle",
  ],

  status: "active",

  embedding: null,
};
