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

  use:
    "Track changes in Nasdaq-100 futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

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
    "equity_market",
    "stock_market",
    "us_stock_market",
    "technology_stocks",
    "technology_sector",
    "growth_stocks",
    "growth_equities",
    "large_cap_technology",
    "futures_market",
    "futures_positioning",
    "equity_positioning",
    "investor_positioning",
    "institutional_positioning",
    "institutional_exposure",
    "open_interest",
    "long_positions",
    "short_positions",
    "net_position",
    "spreading",
    "dealer",
    "dealer_intermediary",
    "asset_manager",
    "institutional",
    "leveraged_funds",
    "leveraged_money",
    "other_reportables",
    "nonreportables",
    "hedging",
    "speculative_positioning",
    "risk_management",
    "market_exposure",
    "risk_appetite",
    "market_sentiment",
    "equity_market_sentiment",
    "financial_markets",
  ],

  status: "active",
  embedding: null,
};