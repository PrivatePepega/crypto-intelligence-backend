import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const buildingPermits: Indicator = {
  id: "building_permits",
  name: "Building Permits",
  domain: "Macroeconomics",
  category: "Housing",

  description:
    "The number of new privately owned housing units authorized by building permits in permit-issuing places across the United States. The series is reported monthly as a seasonally adjusted annual rate and expressed in thousands of units.",

  source: "FRED",
  seriesId: "PERMIT",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Thousands of Units",
  historicalTimeUnit: "m",

  use: "Monitor authorized residential construction activity and assess changes in housing demand, construction intentions, and conditions in the housing market.",

  purpose:
    "Provide a timely measure of new residential building permits for analyzing prospective construction activity, housing-market conditions, construction investment, and the effects of interest rates and financial conditions on housing demand.",

  significance:
    "Building permits provide information about residential construction that has been authorized but may not yet have begun. Changes in permits can provide insight into prospective construction activity, builder intentions, housing demand, and the broader economic cycle.",

  relationTags: [
    "housing",
    "building_permits",
    "residential_construction",
    "construction",
    "housing_demand",
    "economic_activity",
    "economic_growth",
    "interest_rates",
    "financial_conditions",
    "business_cycle",
  ],

  status: "active",

  embedding: null,
};
