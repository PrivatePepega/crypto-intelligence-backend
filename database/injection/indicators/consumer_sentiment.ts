import type { Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

export const consumerSentiment: Indicator = {
  id: "consumer_sentiment",
  name: "Consumer Sentiment",
  domain: "Macroeconomics",
  category: "Consumer Confidence",

  description:
    "The University of Michigan Consumer Sentiment Index, a survey-based measure of U.S. consumer attitudes and expectations regarding economic conditions. The index uses a reference period of 1966 Q1 = 100, is not seasonally adjusted, and is reported monthly.",

  source: "FRED",
  seriesId: "UMCSENT",

  nativeTimeUnit: "month",
  nativeFrequency: "Monthly",
  nativeAggregation: "none",
  unit: "Index 1966:Q1=100",
  historicalTimeUnit: "m",

  use: "Monitor changes in consumer attitudes and expectations about economic conditions and assess shifts in household confidence and sentiment.",

  purpose:
    "Provide a survey-based measure of consumer sentiment for analyzing household expectations, consumer behavior, economic conditions, and potential changes in consumer spending.",

  significance:
    "Consumer sentiment provides information about how households perceive current and expected economic conditions. Changes in sentiment can help contextualize consumer spending and economic activity, although sentiment reflects survey responses and does not directly measure realized household behavior. The source data is delayed by one month at the request of the University of Michigan.",

  relationTags: [
    "consumer_sentiment",
    "consumer_confidence",
    "households",
    "consumer_spending",
    "consumer_demand",
    "economic_conditions",
    "economic_expectations",
    "consumer_behavior",
  ],

  status: "active",

  embedding: null,
};
