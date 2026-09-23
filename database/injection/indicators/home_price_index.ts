import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const homePriceIndex: Indicator = {
  id: "home_price_index",
  name: "U.S. National Home Price Index",
  domain: "Macroeconomics",
  category: "Housing",

  description:
    "The S&P Cotality Case-Shiller U.S. National Home Price Index, a monthly measure of U.S. residential property values based on repeat-sales pricing of existing single-family homes. The index is not seasonally adjusted and uses January 2000 = 100 as its reference period.",

  source: "FRED",
  seriesId: "CSUSHPINSA",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Index Jan 2000=100",

  use:
    "Monitor changes in U.S. residential property values and assess trends in home prices, housing-market conditions, household wealth, and housing affordability.",

  purpose:
    "Provide a broad measure of national U.S. home-price levels for analyzing housing-market trends, changes in property values, household wealth, and relationships between housing prices, financing costs, income, and economic conditions.",

  significance:
    "The national home price index provides information about changes in residential property values across the United States. Changes in home prices can affect housing affordability, household wealth, housing demand, construction incentives, and broader economic conditions.",

  relationTags: [
    "housing",
    "home_prices",
    "home_price_index",
    "housing_market",
    "housing_affordability",
    "household_wealth",
    "housing_demand",
    "interest_rates",
    "mortgage_rates",
    "economic_conditions",
  ],

  status: "active",

  embedding: null,
};