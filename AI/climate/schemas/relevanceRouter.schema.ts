import { z } from "zod";

// One observation retrieved from weather.observations.
export const observationSchema = z.object({
  id: z.string().uuid(),
  observation: z.string(),
  market_domain: z.string(),
  type: z.string(),
});

// One research record retrieved from weather.research.
export const researchedObservationSchema = z.object({
  id: z.string().uuid(),
  observation_id: z.string().uuid(),
  observation: z.string(),
  research: z.string(),
  market_domain: z.string(),
  type: z.string(),
});

// Input provided to the generic relevance router.
export const relevanceRouterInputSchema = z.object({
  section: z.string(),
  sectionInstructions: z.string(),
  domain: z.string(),
  observations: z.array(observationSchema),
  researchedObservations: z.array(researchedObservationSchema),
});

// One observation identified as relevant to the target section/domain.
export const relevantObservationSchema = z.object({
  observationId: z.string().uuid(),

  observation: z.string(),

  research: z.string().nullable(),

  reason: z.string(),
});

// Complete response from the relevance router.
export const relevanceRouterOutputSchema = z.object({
  relevantObservations: z.array(
    relevantObservationSchema,
  ),
});

export type RelevanceRouterDispatchState = {
  jobs: RelevanceRouterInput[];
};

export type RelevanceRouterNodeInput = {
  job: RelevanceRouterInput;
};

// TypeScript types inferred from the schemas.
export type Observation = z.infer<typeof observationSchema>;

export type ResearchedObservation = z.infer<
  typeof researchedObservationSchema
>;

export type RelevanceRouterInput = z.infer<
  typeof relevanceRouterInputSchema
>;

export type RelevantObservation = z.infer<
  typeof relevantObservationSchema
>;

export type RelevanceRouterOutput = z.infer<
  typeof relevanceRouterOutputSchema
>;