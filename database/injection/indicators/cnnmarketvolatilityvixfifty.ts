import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cnnMarketVolatilityVix50: Indicator = {
  id: "cnn_market_volatility_vix_50",
  name: "CNN Market Volatility (VIX vs 50-Day Moving Average)",
  domain: "Financial Markets",
  category: "Market Health",

  description:
    "A daily market-volatility indicator based on the CBOE Volatility Index (VIX) relative to its 50-day moving average. The VIX reflects expected S&P 500 volatility over the following 30 days, while its relationship with the 50-day average is used by CNN as a measure of changing market volatility and fear.",

  source: "CNN",
  seriesId: "cnn_market_volatility_vix_50",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Index",

  use:
    "Monitor changes in expected U.S. equity-market volatility and identify shifts in market stress, risk aversion, and investor sentiment through the VIX's relationship with its 50-day trend.",

  purpose:
    "Provide a volatility-based measure of U.S. equity-market conditions that captures whether expected market volatility is increasing or decreasing relative to its recent trend.",

  significance:
    "The VIX provides a forward-looking measure of expected S&P 500 volatility derived from options prices. Comparing it with its 50-day moving average adds a trend dimension that helps identify changes in market stress and risk perception. Rising volatility relative to its trend is interpreted by CNN as a signal of fear, while declining volatility is associated with greed. As one component of the Fear & Greed framework, it complements momentum, breadth, options positioning, and other measures of market behavior.",

  relationTags: [
    "cnn_market_volatility",
    "market_volatility",
    "vix",
    "vix_index",
    "vix_50_day_moving_average",
    "50_day_moving_average",
    "implied_volatility",
    "expected_volatility",
    "options_market",
    "s_and_p_500",
    "sp500",
    "us_equities",
    "equity_market",
    "stock_market",
    "market_stress",
    "risk_perception",
    "risk_aversion",
    "risk_appetite",
    "investor_sentiment",
    "market_sentiment",
    "fear_and_greed",
    "cnn_fear_greed",
    "risk_on",
    "risk_off",
    "financial_markets",
  ],

  status: "active",
  embedding: null,
};