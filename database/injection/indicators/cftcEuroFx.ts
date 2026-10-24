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
  historicalTimeUnit: "o",

  use: "Track changes in Euro FX futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

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
  ],

  status: "active",
  embedding: null,
};
