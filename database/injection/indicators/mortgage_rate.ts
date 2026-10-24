import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const mortgageRate: Indicator = {
  id: "mortgage_rate",
  name: "30-Year Fixed Mortgage Rate",
  domain: "Macroeconomics",
  category: "Housing",

  description:
    "The average interest rate for 30-year fixed-rate mortgages in the United States, based on Freddie Mac's weekly Primary Mortgage Market Survey. The rate is reported weekly for the period ending Thursday and is not seasonally adjusted.",

  source: "FRED",
  seriesId: "MORTGAGE30US",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly, Ending Thursday",
  nativeAggregation: "average",
  unit: "Percent",
  historicalTimeUnit: "m",

  use: "Monitor mortgage financing costs and assess how changes in interest rates affect housing affordability, home-buying demand, refinancing activity, and residential construction.",

  purpose:
    "Provide a high-frequency measure of U.S. 30-year fixed mortgage rates for analyzing housing-market conditions, household financing costs, interest-rate transmission, and the relationship between monetary and financial conditions and residential activity.",

  significance:
    "Mortgage rates directly affect the financing cost of home purchases and refinancing. Changes in 30-year fixed mortgage rates can influence housing affordability, buyer demand, transaction activity, construction incentives, and the broader transmission of interest-rate conditions into the housing market.",

  relationTags: [
    "housing",
    "mortgage_rates",
    "interest_rates",
    "housing_affordability",
    "housing_demand",
    "home_buying",
    "refinancing",
    "residential_construction",
    "financial_conditions",
    "monetary_policy",
  ],

  status: "active",

  embedding: null,
};
