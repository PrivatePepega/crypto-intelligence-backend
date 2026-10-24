import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcNasdaq: Indicator = {
  id: "cftc_nasdaq",
  name: "CFTC Nasdaq-100 Futures Positioning",
  domain: "Financial Markets",
  category: "Futures Positioning",

  description:
    "A weekly measure of Nasdaq-100 futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates Nasdaq-100 futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Funds, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable.",

  source: "CFTC",
  seriesId: "cftc_nasdaq",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",
  historicalTimeUnit: "o",

  use: "Track changes in Nasdaq-100 futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in Nasdaq-100 futures and how their exposure changes over time.",

  significance:
    "CFTC Nasdaq-100 futures positioning provides a structured view of institutional, leveraged, dealer, and other trader exposure to the Nasdaq-100 and the U.S. equity market segments represented by the index. Changes in open interest reveal changes in futures-market participation, while changes in long and short positions show how each trader group is adjusting exposure to the Nasdaq-100. Because the index is heavily associated with large technology and growth-oriented companies, its futures positioning can provide additional context for analyzing technology-sector risk appetite, growth-equity exposure, investor positioning, and broader U.S. equity-market conditions.",

  relationTags: [
    "cftc_nasdaq",
    "cftc",
    "traders_in_financial_futures",
    "tff",
    "commitments_of_traders",
    "cot",
    "nasdaq",
    "nasdaq_100",
    "nasdaq_100_index",
    "nasdaq_100_futures",
    "nasdaq_futures",
    "ndx",
    "equity_index_futures",
    "stock_index_futures",
    "us_equities",
  ],

  status: "active",
  embedding: null,
};
