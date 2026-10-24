import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const laborForceParticipation: Indicator = {
  id: "labor_force_participation",
  name: "Labor Force Participation Rate",
  domain: "Macroeconomics",
  category: "Labor Market",

  description:
    "The percentage of the civilian noninstitutional population that is either employed or actively looking for work. The series is seasonally adjusted and published monthly.",

  source: "FRED",
  seriesId: "CIVPART",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "average",
  unit: "Percent",
  historicalTimeUnit: "m",

  use: "Monitor changes in labor-force participation and assess shifts in the share of the population engaged in the labor market.",

  purpose:
    "Provide a core measure of labor-force engagement for analyzing labor-market conditions, economic activity, workforce availability, and longer-term demographic and economic trends.",

  significance:
    "The labor force participation rate provides information about the share of the population working or actively seeking work. Changes in participation can affect the available labor supply and help distinguish changes in unemployment from changes in labor-force entry or exit.",

  relationTags: [
    "labor_market",
    "labor_force",
    "employment",
    "unemployment",
    "labor_supply",
    "economic_conditions",
    "economic_activity",
    "demographics",
    "business_cycle",
  ],

  status: "active",

  embedding: null,
};
