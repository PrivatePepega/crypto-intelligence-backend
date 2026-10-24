import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const spotEtfSolana: Indicator = {
  id: "spot_etf_solana",
  name: "Solana Spot ETF Market",
  domain: "Crypto",
  category: "Spot ETF",
  description:
    "A daily measure of U.S. spot Solana ETF market activity, including aggregate net capital flows, traded value, net assets, and cumulative net flows. The indicator provides a view of capital entering or leaving Solana spot ETF vehicles and the size and activity of regulated investment products providing traditional investors with access to Solana.",

  source: "SoSoValue",
  seriesId: "spot_etf_sol",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "USD",
  historicalTimeUnit: "d",

  use: "Track daily capital flows, trading activity, assets under management, and cumulative capital flows in the U.S. spot Solana ETF market.",

  purpose:
    "Provide a daily view of traditional-finance and institutional market participation in Solana through regulated spot ETF vehicles and identify changes in capital allocation toward Solana.",

  significance:
    "Solana spot ETF market data provides a view of capital flows and asset levels within regulated investment vehicles that give traditional investors access to Solana. Net flow measures the daily net movement of capital into or out of the ETF market, while value traded measures ETF trading activity. Net assets indicate the aggregate size of assets held through the ETF vehicles, and cumulative net flow tracks the longer-term accumulation of capital flows. Solana ETF activity can provide context for traditional-finance participation in Solana and can be analyzed alongside Solana price, network activity, transaction activity, staking, DeFi activity, decentralized applications, stablecoin activity, derivatives positioning, macroeconomic conditions, liquidity conditions, and broader crypto-market sentiment. ETF flows should be interpreted as activity within the spot Solana ETF market and should not be treated as a complete measure of all institutional Solana ownership or total Solana demand.",

  relationTags: [
    "spot_etf_solana",
    "solana_spot_etf",
    "solana_etf",
    "spot_etf",
    "etf_flows",
    "solana",
    "sol",
    "solana_market",
    "solana_institutional_adoption",
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
