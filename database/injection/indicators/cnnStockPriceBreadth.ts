import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cnnStockPriceBreadth: Indicator = {
  id: "cnn_stock_price_breadth",
  name: "CNN Stock Price Breadth",
  domain: "Financial Markets",
  category: "Market Health",

  description:
    "A daily CNN market-breadth indicator measuring the breadth of stock-price performance across the U.S. equity market and translating the result into a Fear & Greed rating.",

  source: "CNN",
  seriesId: "cnn_stock_price_breadth",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Index",

  use:
    "Monitor how broadly stock-price gains or declines are distributed across the U.S. equity market and identify changes in market participation, breadth, and overall equity-market strength.",

  purpose:
    "Provide a market-health measure of equity-market breadth that helps determine whether prevailing stock-market conditions are supported by broad participation across stocks or concentrated in a narrower portion of the market.",

  significance:
    "Stock-price breadth provides information about the participation underlying movements in the U.S. equity market. Strong breadth indicates that price strength is distributed across a larger portion of the market, while weak breadth indicates narrower participation or broader selling pressure. As a component of CNN's Fear & Greed framework, the indicator adds a market-participation dimension that complements price momentum, volatility, options activity, and other measures of investor behavior.",

  relationTags: [
    "cnn_stock_price_breadth",
    "stock_price_breadth",
    "market_breadth",
    "breadth",
    "market_health",
    "equity_market",
    "us_equities",
    "stock_market",
    "market_participation",
    "investor_participation",
    "price_strength",
    "price_weakness",
    "market_momentum",
    "market_trend",
    "market_sentiment",
    "investor_sentiment",
    "risk_appetite",
    "risk_on",
    "risk_off",
    "market_regime",
    "fear_and_greed",
    "cnn_fear_greed",
    "financial_markets",
  ],

  status: "active",

  embedding: null,
};