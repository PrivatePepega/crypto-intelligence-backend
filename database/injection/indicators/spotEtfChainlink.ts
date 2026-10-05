import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const spotEtfChainlink: Indicator = {
  id: "spot_etf_chainlink",
  name: "Chainlink Spot ETF Market",
  domain: "Crypto",
  category: "Spot ETF",
  description:
    "A daily measure of U.S. spot Chainlink ETF market activity, including aggregate net capital flows, traded value, net assets, and cumulative net flows. The indicator provides a view of capital entering or leaving Chainlink spot ETF vehicles and the size and activity of regulated investment products providing traditional investors with access to Chainlink.",

  source: "SoSoValue",
  seriesId: "spot_etf_link",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "USD",

  use:
    "Track daily capital flows, trading activity, assets under management, and cumulative capital flows in the U.S. spot Chainlink ETF market.",

  purpose:
    "Provide a daily view of traditional-finance and institutional market participation in Chainlink through regulated spot ETF vehicles and identify changes in capital allocation toward LINK.",

  significance:
    "Chainlink spot ETF market data provides a view of capital flows and asset levels within regulated investment vehicles that give traditional investors access to LINK. Net flow measures the daily net movement of capital into or out of the ETF market, while value traded measures ETF trading activity. Net assets indicate the aggregate size of assets held through the ETF vehicles, and cumulative net flow tracks the longer-term accumulation of capital flows. Chainlink ETF activity can provide context for traditional-finance participation in LINK and can be analyzed alongside Chainlink price, oracle infrastructure activity, decentralized finance, tokenization, real-world asset infrastructure, cross-chain interoperability, blockchain infrastructure adoption, derivatives positioning, macroeconomic conditions, liquidity conditions, and broader crypto-market sentiment. ETF flows should be interpreted as activity within the spot Chainlink ETF market and should not be treated as a complete measure of all institutional LINK ownership or total LINK demand.",

  relationTags: [
  "spot_etf_chainlink",
  "chainlink_spot_etf",
  "chainlink_etf",
  "spot_etf",
  "etf_flows",
  "chainlink",
  "link",
  "link_market",
  "chainlink_market",
  "chainlink_institutional_adoption",
  "net_flow",
  "etf_net_flow",
  "cumulative_net_flow",
  "net_assets",
  "etf_assets",
  ],

  status: "active",
  embedding: null,
};