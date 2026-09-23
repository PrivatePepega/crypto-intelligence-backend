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
  
    use:
      "Track changes in Micro Ether futures open interest and positioning across dealers, asset managers, leveraged funds, other reportable traders, and nonreportable traders, including changes in long, short, spreading, and net exposure.",
  
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
      "eth_futures",
  
      "crypto_futures",
      "digital_asset_derivatives",
      "digital_assets",
      "crypto_derivatives",
      "cryptocurrency_derivatives",
      "derivatives_market",
      "crypto_derivatives_market",
  
      "futures_market",
      "futures_positioning",
      "ethereum_positioning",
      "eth_positioning",
      "micro_eth_positioning",
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
      "0_1_eth_contract",
      "0_1_eth",
      "micro_contract",
  
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
      "ethereum_derivatives",
      "eth_derivatives",
      "digital_asset_non_major"
    ],
  
    status: "active",
    embedding: null,
  };