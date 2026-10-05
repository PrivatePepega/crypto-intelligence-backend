import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcSp500: Indicator = {
  id: "cftc_sp500",
  name: "CFTC S&P 500 Futures Positioning",
  domain: "Financial Markets",
  category: "Futures Positioning",

  description:
    "A weekly measure of S&P 500 futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates S&P 500 futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Funds, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable.",

  source: "CFTC",
  seriesId: "cftc_sp500",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",

  use:
    "Track changes in S&P 500 futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in S&P 500 futures and how their exposure changes over time.",

  significance:
    "CFTC S&P 500 futures positioning provides a structured view of institutional, leveraged, dealer, and other trader exposure to the U.S. equity market through futures. Changes in open interest reveal changes in futures-market participation, while changes in long and short positions show how each trader group is adjusting exposure to the S&P 500. Separating trader classifications helps distinguish institutional investment activity, leveraged positioning, dealer intermediation, and other participation when analyzing U.S. equity-market structure, risk appetite, and investor positioning.",

  relationTags: [
  "cftc_sp500",
  "cftc",
  "traders_in_financial_futures",
  "tff",
  "commitments_of_traders",
  "cot",
  "sp500",
  "s_and_p_500",
  "s_and_p_500_index",
  "s_and_p_500_futures",
  "sp500_futures",
  "equity_index_futures",
  "stock_index_futures",
  "us_equities",
  "equity_market",
  ],

  status: "active",
  embedding: null,
};