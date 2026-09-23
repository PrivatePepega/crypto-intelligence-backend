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
    "2y_treasury_futures",
    "treasury_futures",
    "interest_rate_futures",
    "fixed_income_futures",
    "government_bond_futures",

    "interest_rates",
    "treasury_yields",
    "2_year_yield",
    "short_term_interest_rates",
    "short_end",
    "yield_curve",
    "yield_curve_positioning",
    "monetary_policy",
    "federal_reserve",
    "fed",
    "fed_policy",
    "interest_rate_expectations",
    "monetary_policy_expectations",
    "financial_conditions",

    "futures_market",
    "futures_positioning",
    "treasury_positioning",
    "interest_rate_positioning",
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
    "bond_market",
    "fixed_income",
    "financial_markets",
  ],

  status: "active",
  embedding: null,
};