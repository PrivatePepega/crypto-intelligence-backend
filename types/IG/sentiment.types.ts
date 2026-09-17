import { z } from "zod";

export const igClientSentimentSchema = z.object({
  marketId: z.string(),
  longPositionPercentage: z.number(),
  shortPositionPercentage: z.number(),
});

export type IGClientSentiment = z.infer<
  typeof igClientSentimentSchema
>;
