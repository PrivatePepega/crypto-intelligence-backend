import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const spotEtfDoge: Indicator = {
  id: "spot_etf_dogecoin",
  name: "Dogecoin Spot ETF Market",
  domain: "Crypto",
  category: "Spot ETF",
  description:
    "A daily measure of U.S. spot Dogecoin ETF market activity, including aggregate net capital flows, traded value, net assets, and cumulative net flows. The indicator provides a view of capital entering or leaving Dogecoin spot ETF vehicles and the size and activity of regulated investment products providing traditional investors with access to Dogecoin.",

  source: "SoSoValue",
  seriesId: "spot_etf_doge",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "USD",

  use:
    "Track daily capital flows, trading activity, assets under management, and cumulative capital flows in the U.S. spot Dogecoin ETF market.",

  purpose:
    "Provide a daily view of traditional-finance and institutional market participation in Dogecoin through regulated spot ETF vehicles and identify changes in capital allocation toward Dogecoin.",

  significance:
    "Dogecoin spot ETF market data provides a view of capital flows and asset levels within regulated investment vehicles that give traditional investors access to Dogecoin. Net flow measures the daily net movement of capital into or out of the ETF market, while value traded measures ETF trading activity. Net assets indicate the aggregate size of assets held through the ETF vehicles, and cumulative net flow tracks the longer-term accumulation of capital flows. Dogecoin ETF activity can provide context for participation in Dogecoin through regulated investment products and can be analyzed alongside Dogecoin price, trading volume, social-media attention, retail positioning, market sentiment, volatility, broader meme-asset activity, and overall crypto-market conditions. Because Dogecoin is strongly associated with internet culture and community-driven attention, changes in market participation can interact with shifts in social narratives and speculative activity. ETF flows should be interpreted as activity within the spot Dogecoin ETF market and should not be treated as a complete measure of all institutional Dogecoin ownership or total Dogecoin demand.",

  relationTags: [
  "spot_etf_dogecoin",
  "dogecoin_spot_etf",
  "dogecoin_etf",
  "spot_etf",
  "etf_flows",
  "dogecoin",
  "doge",
  "doge_market",
  "dogecoin_market",
  "dogecoin_institutional_adoption",
  "net_flow",
  "etf_net_flow",
  "cumulative_net_flow",
  "net_assets",
  "etf_assets",
  ],

  status: "active",
  embedding: null,
};