import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcEuroFx: Indicator = {
  id: "cftc_euro_fx",
  name: "CFTC Euro FX Futures Positioning",
  domain: "Financial Markets",
  category: "Currency Futures Positioning",

  description:
    "A weekly measure of Euro FX futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates Euro FX futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Funds, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable.",

  source: "CFTC",
  seriesId: "cftc_euro_fx",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",

  use:
    "Track changes in Euro FX futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in Euro FX futures and how their exposure to the euro changes over time.",

  significance:
    "CFTC Euro FX futures positioning provides a structured view of market-participant exposure to the euro through regulated currency futures. Changes in open interest reveal changes in futures-market participation, while changes in long and short positions show how different trader groups are adjusting their euro exposure. Euro positioning can provide context for EUR/USD dynamics, relative European and U.S. monetary-policy expectations, interest-rate differentials, European economic conditions, and broader foreign-exchange market sentiment.",

  relationTags: [
    "cftc_euro_fx",
    "cftc",
    "traders_in_financial_futures",
    "tff",
    "commitments_of_traders",
    "cot",

    "euro",
    "euro_fx",
    "euro_futures",
    "european_currency",
    "european_currency_unit",
    "eur",
    "eur_usd",
    "eurusd",
    "euro_dollar",
    "foreign_exchange",
    "forex",
    "fx_market",
    "currency_market",
    "currency_futures",
    "fx_futures",

    "euro_positioning",
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

    "european_economy",
    "eurozone",
    "eurozone_economy",
    "european_markets",
    "european_central_bank",
    "ecb",
    "monetary_policy",
    "ecb_policy",
    "interest_rates",
    "interest_rate_differential",
    "us_interest_rates",
    "european_interest_rates",
    "monetary_policy_expectations",

    "exchange_rate",
    "currency_strength",
    "currency_weakness",
    "us_dollar",
    "dollar",
    "dollar_strength",
    "dollar_weakness",
    "global_currency_market",
    "global_markets",

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
    "financial_markets",
  ],

  status: "active",
  embedding: null,
};