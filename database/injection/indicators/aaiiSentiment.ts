import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const aaiiSentiment: Indicator = {
  id: "aaii_sentiment",
  name: "AAII Investor Sentiment Survey",
  domain: "Financial Markets",
  category: "Market Sentiment",

  description:
    "A weekly survey of individual investors measuring the percentage who expect the U.S. stock market to rise, remain essentially unchanged, or fall over the next six months. The dataset includes bullish, neutral, bearish, and bull-bear spread readings.",

  source: "AAII",
  seriesId: "aaii_sentiment",

  nativeTimeUnit: "week",
  nativeFrequency: "Weekly",
  nativeAggregation: "none",
  unit: "Percent",

  use:
    "Monitor changes in individual-investor expectations, optimism, pessimism, uncertainty, and overall sentiment toward the U.S. stock market, including changes in the bull-bear spread.",

  purpose:
    "Provide a direct survey-based measure of individual-investor expectations that complements market-derived sentiment indicators by capturing what retail investors expect the stock market to do over the following six months.",

  significance:
    "The AAII Sentiment Survey provides a direct measure of individual-investor expectations rather than inferring sentiment from market prices or positioning. Changes in bullish, neutral, and bearish responses reveal shifts in optimism, pessimism, and uncertainty, while the bull-bear spread summarizes the balance between optimistic and pessimistic views. Extreme sentiment readings can provide useful context for assessing investor psychology and potential sentiment reversals, but the survey does not establish the future direction of the market.",

  relationTags: [
    "aaii_sentiment",
    "aaii_investor_sentiment",
    "investor_sentiment",
    "retail_investor_sentiment",
    "individual_investors",
    "retail_investors",
    "market_sentiment",
    "investor_expectations",
    "market_expectations",
    "bullish_sentiment",
    "bearish_sentiment",
    "neutral_sentiment",
    "bull_bear_spread",
    "bull_bear_difference",
    "optimism",
    "pessimism",
    "uncertainty",
    "investor_psychology",
    "market_psychology",
    "sentiment_extremes",
    "contrarian_indicator",
    "us_equities",
    "equity_market",
    "stock_market",
    "six_month_outlook",
    "financial_markets",
  ],

  status: "active",
  embedding: null,
};