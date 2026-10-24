import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cftcMicroEthereum: Indicator = {
  id: "cftc_micro_ethereum",
  name: "CFTC Micro Ether Futures Positioning",
  domain: "Crypto",
  category: "Futures Positioning",

  description:
    "A weekly measure of Micro Ether futures open interest and trader positioning reported by the CFTC's Traders in Financial Futures report. The data separates Micro Ether futures positions into Dealer/Intermediary, Asset Manager/Institutional, Leveraged Funds, Other Reportables, and Nonreportables, with long, short, spreading, and net exposure measures where applicable. Each Micro Ether futures contract represents 0.1 ETH.",

  source: "CFTC",
  seriesId: "cftc_micro_ethereum",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Contracts",
  historicalTimeUnit: "o",

  use: "Track changes in Micro Ether futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

  purpose:
    "Provide asset-specific visibility into how different classes of market participants are positioned in Micro Ether futures and how their exposure changes over time.",

  significance:
    "CFTC Micro Ether futures positioning provides a structured view of trader exposure to Ethereum through a smaller-sized regulated futures contract. Changes in open interest reveal changes in participation in the Micro Ether futures market, while changes in long and short positions show how different trader groups are adjusting their Ethereum exposure. Because each contract represents 0.1 ETH, the Micro Ether contract provides a lower-contract-size representation of Ethereum derivatives positioning that complements standard Ether futures data and can provide additional context for crypto market structure, trader positioning, institutional and leveraged activity, and Ethereum derivatives-market conditions.",

  relationTags: [
    "cftc_micro_ethereum",
    "cftc",
    "traders_in_financial_futures",
    "tff",
    "commitments_of_traders",
    "cot",
    "ethereum",
    "ether",
    "eth",
    "micro_ether",
    "micro_ethereum",
    "micro_eth",
    "micro_eth_futures",
    "micro_ethereum_futures",
    "ethereum_futures",
  ],

  status: "active",
  embedding: null,
};
