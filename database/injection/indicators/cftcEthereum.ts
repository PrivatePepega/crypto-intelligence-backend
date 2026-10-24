import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcEthereum: Indicator = {
  id: "cftc_ethereum",
  name: "CFTC Ethereum Futures Positioning",
  domain: "Crypto",
  category: "Futures Positioning",

  description:
    "A weekly measure of Ethereum futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates Ethereum futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Funds, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable. Each Ethereum futures contract represents 50 ETH.",

  source: "CFTC",
  seriesId: "cftc_ethereum",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",
  historicalTimeUnit: "o",

  use: "Track changes in Ethereum futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in Ethereum futures and how their exposure changes over time.",

  significance:
    "CFTC Ethereum futures positioning provides a structured view of institutional, leveraged, dealer, and other trader exposure to Ethereum through regulated futures markets. Changes in open interest reveal changes in futures-market participation, while changes in long and short positions show how each trader group is adjusting exposure to Ethereum. Because Ethereum is a major cryptoasset with substantial derivatives activity, futures positioning can provide context for Ethereum market structure, institutional participation, derivatives-market sentiment, risk appetite, and changes in exposure to the broader crypto market.",

  relationTags: [
    "cftc_ethereum",
    "cftc",
    "traders_in_financial_futures",
    "tff",
    "commitments_of_traders",
    "cot",
    "ethereum",
    "ether",
    "eth",
    "ethereum_futures",
    "eth_futures",
    "crypto_futures",
    "digital_asset_derivatives",
    "digital_assets",
    "crypto_derivatives",
  ],

  status: "active",
  embedding: null,
};
