import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const cnnPutCallOptions: Indicator = {
  id: "cnn_put_call_options",
  name: "CNN Put/Call Options",
  domain: "Financial Markets",
  category: "Market Health",

  description:
    "A daily put-to-call options ratio used by CNN as a measure of U.S. equity-market sentiment. The ratio compares put-option activity with call-option activity and is translated into a Fear & Greed rating.",

  source: "CNN",
  seriesId: "cnn_put_call_options",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Ratio",
  historicalTimeUnit: "d",

  use: "Monitor changes in equity-options positioning and assess shifts in investor risk appetite, hedging activity, speculative demand, and market sentiment within the CNN Fear & Greed framework.",

  purpose:
    "Provide an options-market sentiment measure that captures changes in the relative demand for put and call options and adds information about investor positioning and perceived market risk to broader market-health analysis.",

  significance:
    "The put/call ratio provides information about how options-market activity is distributed between puts and calls. Relatively greater put activity can reflect increased demand for downside protection or bearish positioning, while relatively greater call activity can reflect greater demand for upside exposure or speculative positioning. As a component of CNN's Fear & Greed Index, the ratio provides a market-positioning signal that complements momentum, breadth, volatility, and other measures of investor behavior.",

  relationTags: [
    "cnn_put_call_options",
    "put_call_ratio",
    "put_call",
    "options_market",
    "equity_options",
    "options_activity",
    "options_positioning",
    "investor_positioning",
    "investor_sentiment",
    "market_sentiment",
    "risk_appetite",
    "risk_aversion",
    "hedging",
    "downside_protection",
    "speculation",
  ],

  status: "active",

  embedding: null,
};
