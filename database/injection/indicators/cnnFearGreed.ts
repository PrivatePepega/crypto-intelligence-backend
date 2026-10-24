import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cnnFearGreed: Indicator = {
  id: "cnn_fear_greed",
  name: "CNN Fear & Greed Index",
  domain: "Financial Markets",
  category: "Market Sentiment",

  description:
    "A daily composite index designed by CNN to measure prevailing fear and greed in the U.S. stock market using multiple market-behavior indicators. The index ranges from 0 to 100, with lower values representing greater fear and higher values representing greater greed.",

  source: "CNN",
  seriesId: "cnn_fear_greed",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Score",
  historicalTimeUnit: "d",

  use: "Monitor changes in U.S. equity-market sentiment, investor risk appetite, market momentum, volatility, and demand for defensive assets, and identify shifts between risk-seeking and risk-averse market conditions.",

  purpose:
    "Provide a compact market-sentiment signal that summarizes several observable characteristics of U.S. equity markets into a single daily measure for tracking changes in investor risk appetite and market stress.",

  significance:
    "The Fear & Greed Index provides a behavioral measure of the prevailing emotional conditions in U.S. equity markets. Changes in the index can indicate shifts in market momentum, volatility, demand for safe-haven assets, and willingness to take risk. It can therefore provide context for interpreting market moves alongside prices, volatility measures, credit conditions, and broader financial-market indicators.",

  relationTags: [
    "cnn_fear_greed",
    "fear_and_greed",
    "market_sentiment",
    "investor_sentiment",
    "investor_behavior",
    "risk_appetite",
    "risk_aversion",
    "market_psychology",
    "market_momentum",
    "market_volatility",
    "stock_market",
    "us_equities",
    "equity_market",
    "market_stress",
    "safe_haven_demand",
  ],

  status: "active",

  embedding: null,
};
