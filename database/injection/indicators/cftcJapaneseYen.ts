import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcJapaneseYen: Indicator = {
  id: "cftc_japanese_yen",
  name: "CFTC Japanese Yen Futures Positioning",
  domain: "Financial Markets",
  category: "Currency Futures Positioning",

  description:
    "A weekly measure of Japanese Yen futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates Japanese Yen futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Funds, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable.",

  source: "CFTC",
  seriesId: "cftc_japanese_yen",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",

  use:
    "Track changes in Japanese Yen futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in Japanese Yen futures and how their exposure to the yen changes over time.",

  significance:
    "CFTC Japanese Yen futures positioning provides a structured view of market-participant exposure to the Japanese yen through regulated currency futures. Changes in open interest reveal changes in futures-market participation, while changes in long and short positions show how different trader groups are adjusting their yen exposure. Yen positioning can provide context for USD/JPY dynamics, Bank of Japan monetary policy, Japanese interest rates, U.S.-Japan interest-rate differentials, Japanese economic conditions, and changes in global risk sentiment.",

  relationTags: [
    "cftc_japanese_yen",
    "cftc",
    "traders_in_financial_futures",
    "tff",
    "commitments_of_traders",
    "cot",

    "japanese_yen",
    "yen",
    "jpy",
    "yen_fx",
    "yen_futures",
    "japanese_currency",
    "japanese_currency_futures",
    "currency_futures",
    "fx_futures",
    "foreign_exchange",
    "forex",
    "fx_market",
    "currency_market",

    "usd_jpy",
    "usdjpy",
    "yen_dollar",
    "exchange_rate",
    "currency_strength",
    "currency_weakness",
    "global_currency_market",

    "yen_positioning",
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

    "japan",
    "japanese_economy",
    "japanese_markets",
    "bank_of_japan",
    "boj",
    "boj_policy",
    "monetary_policy",
    "interest_rates",
    "japanese_interest_rates",
    "us_interest_rates",
    "interest_rate_differential",
    "monetary_policy_expectations",

    "carry_trade",
    "yen_carry_trade",
    "carry_trade_unwind",
    "risk_on",
    "risk_off",
    "risk_appetite",
    "risk_aversion",
    "safe_haven",
    "safe_haven_currency",
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