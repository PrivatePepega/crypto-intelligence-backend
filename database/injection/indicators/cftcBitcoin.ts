import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcBitcoin: Indicator = {
  id: "cftc_bitcoin",
  name: "CFTC Bitcoin Futures Positioning",
  domain: "Crypto",
  category: "Futures Positioning",

  description:
    "A weekly measure of Bitcoin futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates Bitcoin futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Money, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable.",

  source: "CFTC",
  seriesId: "cftc_bitcoin",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",

  use:
    "Track changes in Bitcoin futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including shifts in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in Bitcoin futures and how their exposure changes over time.",

  significance:
    "CFTC Bitcoin futures positioning provides a structured view of institutional, leveraged, dealer, and other trader exposure to Bitcoin through regulated futures markets. Changes in open interest reveal changes in futures-market participation, while changes in long and short positions show how each trader group is adjusting directional exposure. Separating trader classifications allows the intelligence system to distinguish institutional and leveraged positioning from dealer activity and aggregate nonreportable participation when analyzing Bitcoin market structure and sentiment.",

  relationTags: [
  "cftc_bitcoin",
  "cftc",
  "traders_in_financial_futures",
  "tff",
  "commitments_of_traders",
  "cot",
  "bitcoin",
  "btc",
  "bitcoin_futures",
  "btc_futures",
  "crypto_futures",
  "digital_asset_derivatives",
  "futures_market",
  "futures_positioning",
  "bitcoin_positioning",
  ],

  status: "active",
  embedding: null,
};