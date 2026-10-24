import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const alternativeCryptoFearGreed: Indicator = {
  id: "alternative_crypto_fear_greed",
  name: "Alternative.me Crypto Fear & Greed Index",
  domain: "Crypto",
  category: "Market Sentiment",
  description:
    "A daily composite index from Alternative.me measuring crypto-market sentiment on a scale from 0 to 100, where lower values represent greater fear and higher values represent greater greed. Alternative.me derives the index from multiple sentiment-related inputs, including Bitcoin volatility, market momentum and volume, social media activity, surveys, Bitcoin dominance, and Google Trends. Alternative.me's published methodology currently identifies the index as Bitcoin-focused.",

  source: "Alternative.me",
  seriesId: "alternative_crypto_fear_greed",

  nativeTimeUnit: "day",
  nativeFrequency: "Daily",
  nativeAggregation: "none",
  unit: "Index (0-100)",
  historicalTimeUnit: "o",

  use: "Track daily changes in aggregate crypto-market sentiment using Alternative.me's composite Fear & Greed Index and its fear-to-greed classification.",

  purpose:
    "Provide a standardized daily measure of market sentiment that can be used to identify shifts between fear, neutrality, and greed in the crypto market.",

  significance:
    "The Alternative.me Crypto Fear & Greed Index combines multiple market and sentiment signals into a single 0-to-100 measure. Alternative.me's published methodology assigns 25% weight to volatility, 25% to market momentum and volume, 15% to social media, 15% to surveys, 10% to Bitcoin dominance, and 10% to Google Trends, although Alternative.me currently states that its surveys are paused. The index therefore captures several dimensions of market behavior rather than directly measuring investor sentiment through a single survey. It can be analyzed alongside price trends, volatility, trading volume, derivatives positioning, funding rates, market breadth, Bitcoin dominance, and other sentiment indicators to provide broader context for changes in crypto-market conditions.",

  relationTags: [
    "alternative_crypto_fear_greed",
    "alternative_me",
    "fear_greed_index",
    "market_sentiment",
    "crypto_sentiment",
    "bitcoin",
    "bitcoin_sentiment",
    "crypto_market",
    "crypto_market_sentiment",
    "volatility",
    "market_momentum",
    "trading_volume",
    "bitcoin_dominance",
    "social_media_sentiment",
    "google_trends",
  ],

  status: "active",
  embedding: null,
};
