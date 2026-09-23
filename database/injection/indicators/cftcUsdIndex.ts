import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcUsdIndex: Indicator = {
  id: "cftc_usd_index",
  name: "CFTC U.S. Dollar Index Futures Positioning",
  domain: "Financial Markets",
  category: "Currency Futures Positioning",

  description:
    "A weekly measure of U.S. Dollar Index futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates U.S. Dollar Index futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Funds, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable.",

  source: "CFTC",
  seriesId: "cftc_usd_index",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",

  use:
    "Track changes in U.S. Dollar Index futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in U.S. Dollar Index futures and how their exposure to broad U.S. dollar strength changes over time.",

  significance:
    "CFTC U.S. Dollar Index futures positioning provides a structured view of market-participant exposure to the U.S. dollar relative to a basket of major foreign currencies. Changes in open interest reveal changes in futures-market participation, while changes in long and short positions show how different trader groups are adjusting dollar exposure. Dollar positioning can provide context for broad USD strength, global foreign-exchange conditions, U.S. monetary-policy expectations, interest-rate differentials, commodity prices, international financial conditions, and global risk sentiment.",

  relationTags: [
    "cftc_usd_index",
    "cftc",
    "traders_in_financial_futures",
    "tff",
    "commitments_of_traders",
    "cot",

    "us_dollar_index",
    "dollar_index",
    "dxy",
    "dx",
    "usd_index",
    "us_dollar",
    "dollar",
    "usd",
    "broad_dollar",
    "broad_usd",
    "dollar_strength",
    "dollar_weakness",

    "foreign_exchange",
    "forex",
    "fx_market",
    "currency_market",
    "currency_futures",
    "fx_futures",
    "global_currency_market",
    "exchange_rates",

    "dollar_positioning",
    "usd_positioning",
    "currency_positioning",
    "fx_positioning",
    "futures_market",
    "futures_positioning",
    "investor_positioning",
    "institutional_positioning",
    "institutional_exposure",
    "open_interest",
    "long_positions",
    "short_positions",
    "net_position",
    "spreading",

    "federal_reserve",
    "fed",
    "fed_policy",
    "monetary_policy",
    "interest_rates",
    "us_interest_rates",
    "interest_rate_differential",
    "monetary_policy_expectations",
    "treasury_yields",
    "financial_conditions",

    "global_liquidity",
    "global_financial_conditions",
    "international_markets",
    "global_markets",
    "capital_flows",
    "cross_border_flows",

    "commodities",
    "commodity_prices",
    "gold",
    "oil",
    "crude_oil",

    "risk_appetite",
    "risk_aversion",
    "risk_on",
    "risk_off",
    "global_risk_sentiment",
    "market_sentiment",

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
    "financial_markets",
  ],

  status: "active",
  embedding: null,
};