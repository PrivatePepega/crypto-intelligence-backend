import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const igUsdJpy: Indicator = {
  id: "ig_usd_jpy",
  name: "IG USD/JPY Retail Positioning",
  domain: "Financial Markets",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among retail traders on the IG trading platform for the USD/JPY currency pair. The indicator reports the percentage of IG retail traders holding long and short positions and the resulting net positioning. This data represents IG's own retail trader pool and is not a market-wide measure of all retail traders or investors.",

  source: "IG",
  seriesId: "ig_usd_jpy",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Percentage",

  use:
    "Track daily changes in long and short positioning among IG retail traders exposed to USD/JPY, including the distribution of positions and the resulting net retail positioning.",

  purpose:
    "Provide a daily view of how IG's retail trader population is positioned toward the USD/JPY exchange rate and how that positioning changes over time.",

  significance:
    "IG USD/JPY retail positioning provides a daily view of directional exposure among retail traders using the IG trading platform. The indicator can provide context for retail sentiment, speculative positioning, and changes in exposure to the U.S. dollar relative to the Japanese yen. Because the dataset represents only IG's retail trader pool rather than the entire retail-investor population, it should be interpreted as a broker-specific positioning signal rather than a comprehensive measure of overall retail sentiment. USD/JPY positioning can be analyzed alongside Bank of Japan and Federal Reserve policy, interest-rate differentials, Treasury and Japanese government bond yields, yen carry-trade conditions, and broader risk sentiment to provide additional context for changes in the dollar-yen market.",

  relationTags: [
    "ig_usd_jpy",
    "ig_retail_traders",
    "retail_positioning",
    "retail_sentiment",
    "broker_specific_positioning",

    "usd_jpy",
    "usdjpy",
    "dollar_yen",
    "us_dollar",
    "japanese_yen",
    "foreign_exchange",
    "currency_market",

    "long_positions",
    "short_positions",
    "net_position",
    "directional_exposure",
    "positioning_changes",

    "bank_of_japan",
    "boj_policy",
    "federal_reserve",
    "fed_policy",
    "monetary_policy",
    "interest_rate_differential",

    "us_interest_rates",
    "japan_interest_rates",
    "treasury_yields",
    "jgb_yields",
    "yield_differential",

    "yen_strength",
    "yen_weakness",
    "usd_strength",
    "usd_weakness",

    "yen_carry_trade",
    "carry_trade",
    "risk_sentiment",

    "fx_positioning",
    "financial_conditions",
    "financial_markets"
  ],

  status: "active",
  embedding: null,
};