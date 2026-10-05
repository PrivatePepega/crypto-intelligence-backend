import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const spotEtfBitcoin: Indicator = {
  id: "spot_etf_bitcoin",
  name: "Bitcoin Spot ETF Market",
  domain: "Crypto",
  category: "Spot ETF",
  description:
    "A daily measure of U.S. spot Bitcoin ETF market activity, including aggregate net capital flows, traded value, net assets, and cumulative net flows. The indicator provides a view of capital entering or leaving the Bitcoin spot ETF market and the size and activity of the investment vehicles providing regulated market access to Bitcoin.",

  source: "SoSoValue",
  seriesId: "spot_etf_btc",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "USD",

  use:
    "Track daily capital flows, trading activity, assets under management, and cumulative capital flows in the U.S. spot Bitcoin ETF market.",

  purpose:
    "Provide a daily view of institutional and traditional-finance market participation in Bitcoin through regulated spot ETF vehicles and identify changes in capital allocation toward Bitcoin.",

  significance:
    "Bitcoin spot ETF market data provides a direct view of capital flows and asset levels within regulated investment vehicles that give traditional investors access to Bitcoin. Net flow measures the daily net movement of capital into or out of the ETF market, while value traded measures ETF trading activity. Net assets indicate the aggregate size of assets held through the ETF vehicles, and cumulative net flow tracks the longer-term accumulation of capital flows since the measurement period began. Bitcoin ETF activity can provide important context for institutional and traditional-finance participation in Bitcoin and can be analyzed alongside Bitcoin price, Bitcoin dominance, derivatives positioning, open interest, funding rates, macroeconomic conditions, inflation expectations, interest rates, Treasury yields, liquidity conditions, and broader crypto-market sentiment. ETF flows should be interpreted as activity within the spot Bitcoin ETF market and should not be treated as a complete measure of all institutional Bitcoin ownership or total Bitcoin demand.",

  relationTags: [
  "spot_etf_bitcoin",
  "bitcoin_spot_etf",
  "bitcoin_etf",
  "spot_etf",
  "etf_flows",
  "bitcoin",
  "btc",
  "bitcoin_market",
  "bitcoin_institutional_adoption",
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