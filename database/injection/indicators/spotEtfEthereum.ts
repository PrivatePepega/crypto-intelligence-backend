import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const spotEtfEthereum: Indicator = {
  id: "spot_etf_ethereum",
  name: "Ethereum Spot ETF Market",
  domain: "Crypto",
  category: "Spot ETF",
  description:
    "A daily measure of U.S. spot Ethereum ETF market activity, including aggregate net capital flows, traded value, net assets, and cumulative net flows. The indicator provides a view of capital entering or leaving Ethereum spot ETF vehicles and the size and activity of regulated investment products providing traditional investors with access to Ethereum.",

  source: "SoSoValue",
  seriesId: "spot_etf_eth",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "USD",
  historicalTimeUnit: "d",

  use: "Track daily capital flows, trading activity, assets under management, and cumulative capital flows in the U.S. spot Ethereum ETF market.",

  purpose:
    "Provide a daily view of traditional-finance and institutional market participation in Ethereum through regulated spot ETF vehicles and identify changes in capital allocation toward Ethereum.",

  significance:
    "Ethereum spot ETF market data provides a direct view of capital flows and asset levels within regulated investment vehicles that give traditional investors access to Ethereum. Net flow measures the daily net movement of capital into or out of the ETF market, while value traded measures ETF trading activity. Net assets indicate the aggregate size of assets held through the ETF vehicles, and cumulative net flow tracks the longer-term accumulation of capital flows. Ethereum ETF activity can provide context for traditional-finance participation in Ethereum and can be analyzed alongside Ethereum price, network activity, staking, DeFi activity, smart-contract usage, tokenization and real-world asset activity, derivatives positioning, macroeconomic conditions, interest rates, liquidity conditions, and broader crypto-market sentiment. ETF flows should be interpreted as activity within the spot Ethereum ETF market and should not be treated as a complete measure of all institutional Ethereum ownership or total Ethereum demand.",

  relationTags: [
    "spot_etf_ethereum",
    "ethereum_spot_etf",
    "ethereum_etf",
    "spot_etf",
    "etf_flows",
    "ethereum",
    "eth",
    "ethereum_market",
    "ethereum_institutional_adoption",
    "institutional_investment",
    "net_flow",
    "etf_net_flow",
    "cumulative_net_flow",
    "net_assets",
    "etf_assets",
  ],

  status: "active",
  embedding: null,
};
