// types/alternativeMe/fearGreed.ts

import { z } from "zod";

export const alternativeMeFearGreedSchema = z.object({
  name: z.string(),

  data: z.array(
    z.object({
      value: z.string(),
      value_classification: z.string(),
      timestamp: z.string(),
      time_until_update: z.string().optional(),
    })
  ),

  metadata: z.object({
    error: z.nullable(z.any()),
  }),
});