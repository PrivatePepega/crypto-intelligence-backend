import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcUst10y: Indicator = {
  id: "cftc_ust_10y",
  name: "CFTC 10-Year U.S. Treasury Note Futures Positioning",
  domain: "Financial Markets",
  category: "Interest Rate Futures Positioning",

  description:
    "A weekly measure of 10-Year U.S. Treasury Note futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates Treasury futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Funds, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable.",

  source: "CFTC",
  seriesId: "cftc_ust_10y",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",
  historicalTimeUnit: "o",

  use: "Track changes in 10-Year U.S. Treasury futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in 10-Year U.S. Treasury Note futures and how their exposure changes over time.",

  significance:
    "CFTC 10-Year Treasury futures positioning provides a structured view of market-participant exposure to the intermediate-to-longer portion of the U.S. Treasury market. Changes in open interest reveal changes in futures-market participation, while changes in long and short positions show how different trader groups are adjusting exposure to 10-Year Treasury futures. The 10-Year Treasury market is closely connected to expectations for monetary policy, inflation, economic growth, and the broader supply and demand for government debt, making positioning useful context for Treasury yields, duration risk, the yield curve, and broader financial conditions.",

  relationTags: [
    "cftc_ust_10y",
    "cftc",
    "traders_in_financial_futures",
    "tff",
    "commitments_of_traders",
    "cot",
    "us_treasury",
    "us_treasuries",
    "treasury_bonds",
    "treasury_notes",
    "10_year_treasury",
    "10_year_treasury_note",
    "10y_treasury",
    "ust_10y",
    "ust_10y_note",
  ],

  status: "active",
  embedding: null,
};
