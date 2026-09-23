import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const jobOpenings: Indicator = {
  id: "job_openings",
  name: "Job Openings",
  domain: "Macroeconomics",
  category: "Labor Market",

  description:
    "The number of available nonfarm jobs that remain unfilled on the last business day of the month and meet the criteria for an active job opening. The series is seasonally adjusted and reported in thousands of job openings.",

  source: "FRED",
  seriesId: "JTSJOL",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "average",
  unit: "Thousands of Job Openings",

  use:
    "Monitor unmet demand for labor and changes in the availability of job opportunities across the nonfarm economy.",

  purpose:
    "Provide a measure of labor demand and job-market tightness for analyzing employment conditions, labor shortages, hiring demand, and changes in economic activity.",

  significance:
    "Job openings provide information about demand for workers that has not yet been met through hiring. Changes in openings can indicate shifts in labor-market tightness, employer hiring demand, and the balance between available workers and available jobs.",

  relationTags: [
    "labor_market",
    "labor_demand",
    "job_openings",
    "employment",
    "unemployment",
    "labor_shortages",
    "labor_market_tightness",
    "hiring",
    "economic_conditions",
  ],

  status: "active",

  embedding: null,
};