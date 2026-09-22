import { z } from "zod";

export const indicatorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),

  source: z.string().min(1),
  seriesId: z.string().min(1),

  nativeTimeUnit: z.string().min(1),
  nativeFrequency: z.string().min(1),
  nativeAggregation: z.string().min(1),
  unit: z.string().min(1),

  use: z.string().min(1),
  purpose: z.string().min(1),
  significance: z.string().min(1),

  relationTags: z.array(z.string()),

  status: z.enum(["active", "inactive"]),
});

export type Indicator = z.infer<typeof indicatorSchema>;