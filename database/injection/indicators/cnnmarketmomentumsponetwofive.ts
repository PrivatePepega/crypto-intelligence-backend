import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cnnMarketMomentumSp125: Indicator = {
  id: "cnn_market_momentum_sp125",
  name: "CNN Market Momentum (S&P 500 vs 125-Day Moving Average)",
  domain: "Financial Markets",
  category: "Market Health",

  description:
    "A daily CNN market-momentum indicator based on the level of the S&P 500 relative to its 125-day moving average. The indicator measures whether the broad U.S. equity market is trading above or below its recent long-term trend and assigns a corresponding Fear & Greed rating.",

  source: "CNN",
  seriesId: "cnn_market_momentum_sp125",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Index",

  use:
    "Monitor the direction and strength of the U.S. equity-market trend and identify changes between positive and weakening market momentum within the CNN Fear & Greed framework.",

  purpose:
    "Provide a trend-based measure of S&P 500 market momentum for assessing whether U.S. equities are trading above or below their 125-day trend and for adding a medium-term momentum dimension to broader market-health analysis.",

  significance:
    "The S&P 500's position relative to its 125-day moving average provides a medium-term measure of equity-market trend strength. Persistent movement above the moving average indicates positive momentum, while movement below it indicates weakening momentum. As a component of CNN's Fear & Greed Index, the indicator helps distinguish prevailing market conditions associated with increasing greed or fear from other measures such as volatility, breadth, options positioning, and safe-haven demand.",

  relationTags: [
  "cnn_market_momentum",
  "market_momentum",
  "momentum",
  "sp500",
  "s_and_p_500",
  "us_equities",
  "equity_market",
  "stock_market",
  "125_day_moving_average",
  "moving_average",
  "market_trend",
  "trend_strength",
  "technical_analysis",
  "market_health",
  "market_sentiment",
  ],

  status: "active",

  embedding: null,
};