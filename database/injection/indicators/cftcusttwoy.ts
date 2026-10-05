import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcUst2y: Indicator = {
  id: "cftc_ust_2y",
  name: "CFTC 2-Year U.S. Treasury Note Futures Positioning",
  domain: "Financial Markets",
  category: "Interest Rate Futures Positioning",

  description:
    "A weekly measure of 2-Year U.S. Treasury Note futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates Treasury futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Funds, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable.",

  source: "CFTC",
  seriesId: "cftc_ust_2y",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",

  use:
    "Track changes in 2-Year U.S. Treasury futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in 2-Year U.S. Treasury Note futures and how their exposure changes over time.",

  significance:
    "CFTC 2-Year Treasury futures positioning provides a structured view of market-participant exposure to the short end of the U.S. Treasury curve. Changes in open interest reveal changes in futures-market participation, while changes in long and short positions show how different trader groups are adjusting exposure to 2-Year Treasury futures. Because the 2-Year Treasury yield is closely connected to expectations for Federal Reserve policy and the near-term path of interest rates, changes in positioning can provide context for monetary-policy expectations, interest-rate risk, Treasury-market sentiment, and broader financial conditions.",

  relationTags: [
  "cftc_ust_2y",
  "cftc",
  "traders_in_financial_futures",
  "tff",
  "commitments_of_traders",
  "cot",
  "us_treasury",
  "us_treasuries",
  "treasury_bonds",
  "treasury_notes",
  "2_year_treasury",
  "2_year_treasury_note",
  "2y_treasury",
  "ust_2y",
  "ust_2y_note",
  ],

  status: "active",
  embedding: null,
};