import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const housingStarts: Indicator = {
  id: "housing_starts",
  name: "Housing Starts",
  domain: "Macroeconomics",
  category: "Housing",

  description:
    "The number of new privately owned housing units started in the United States, where a start occurs when excavation begins for the footings or foundation of a building. The series is reported monthly as a seasonally adjusted annual rate and expressed in thousands of units.",

  source: "FRED",
  seriesId: "HOUST",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "average",
  unit: "Thousands of Units",
  historicalTimeUnit: "m",

  use: "Monitor new residential construction activity and assess changes in housing-sector conditions, construction demand, economic activity, and sensitivity to financing conditions.",

  purpose:
    "Provide a timely measure of residential construction starts for analyzing housing-market activity, construction investment, economic growth, and the effects of interest rates and financial conditions on housing demand.",

  significance:
    "Housing starts provide information about new residential construction activity and are an important component of the housing and construction sectors. Changes in starts can provide insight into builders' activity, housing demand, construction investment, and the broader economic cycle.",

  relationTags: [
    "housing",
    "housing_starts",
    "residential_construction",
    "construction",
    "economic_activity",
    "economic_growth",
    "consumer_demand",
    "interest_rates",
    "financial_conditions",
    "business_cycle",
  ],

  status: "active",

  embedding: null,
};
