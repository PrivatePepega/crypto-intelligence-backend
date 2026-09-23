import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const igEuroUsd: Indicator = {
  id: "ig_euro_usd",
  name: "IG EUR/USD Retail Positioning",
  domain: "Financial Markets",
  category: "Retail Positioning",
  description:
    "A daily measure of long and short positioning among retail traders on the IG trading platform for the EUR/USD currency pair. The indicator reports the percentage of IG retail traders holding long and short positions and the resulting net positioning. This data represents IG's own retail trader pool and is not a market-wide measure of all retail traders or investors.",

  source: "IG",
  seriesId: "ig_euro_usd",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Percentage",

  use:
    "Track daily changes in long and short positioning among IG retail traders exposed to EUR/USD, including the distribution of positions and the resulting net retail positioning.",

  purpose:
    "Provide a daily view of how IG's retail trader population is positioned toward the EUR/USD exchange rate and how that positioning changes over time.",

  significance:
    "IG EUR/USD retail positioning provides a daily view of directional exposure among retail traders using the IG trading platform. The indicator can provide context for retail sentiment, speculative positioning, and changes in exposure to the euro-dollar exchange rate. Because the dataset represents only IG's retail trader pool rather than the entire retail-investor population, it should be interpreted as a broker-specific positioning signal rather than a comprehensive measure of overall retail sentiment. EUR/USD positioning can be analyzed alongside European Central Bank and Federal Reserve policy, Eurozone and U.S. economic conditions, interest-rate differentials, European and U.S. bond yields, and broader foreign-exchange market dynamics to provide additional context for changes in the euro-dollar market.",

  relationTags: [
    "ig_euro_usd",
    "ig_retail_traders",
    "retail_positioning",
    "retail_sentiment",
    "broker_specific_positioning",

    "eur_usd",
    "eurusd",
    "euro_dollar",
    "euro",
    "us_dollar",
    "foreign_exchange",
    "currency_market",

    "long_positions",
    "short_positions",
    "net_position",
    "directional_exposure",
    "positioning_changes",

    "european_central_bank",
    "ecb_policy",
    "federal_reserve",
    "fed_policy",
    "monetary_policy",
    "interest_rate_differential",

    "eurozone",
    "eurozone_economy",
    "us_economy",
    "economic_growth",

    "european_interest_rates",
    "us_interest_rates",
    "european_bond_yields",
    "treasury_yields",
    "yield_differential",

    "euro_strength",
    "euro_weakness",
    "usd_strength",
    "usd_weakness",

    "risk_sentiment",
    "fx_positioning",
    "financial_conditions",
    "financial_markets"
  ],

  status: "active",
  embedding: null,
};