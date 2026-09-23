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

  use:
    "Track changes in Ethereum futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",

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
    "cryptocurrency_derivatives",
    "futures_market",
    "futures_positioning",

    "ethereum_positioning",
    "eth_positioning",
    "crypto_positioning",
    "trader_positioning",
    "investor_positioning",
    "institutional_positioning",
    "institutional_exposure",
    "open_interest",
    "long_positions",
    "short_positions",
    "net_position",
    "spreading",
    "contract_size",
    "50_eth_contract",

    "crypto_market",
    "crypto_market_structure",
    "ethereum_market",
    "eth_market",
    "digital_asset_market",
    "crypto_institutional_activity",
    "crypto_institutional_exposure",
    "crypto_risk_appetite",
    "crypto_market_sentiment",
    "market_sentiment",
    "risk_appetite",
    "risk_management",
    "hedging",
    "speculative_positioning",

    "dealer",
    "dealer_intermediary",
    "asset_manager",
    "institutional",
    "leveraged_funds",
    "leveraged_money",
    "other_reportables",
    "nonreportables",

    "market_exposure",
    "derivatives_market",
    "crypto_derivatives_market",
  ],

  status: "active",
  embedding: null,
};