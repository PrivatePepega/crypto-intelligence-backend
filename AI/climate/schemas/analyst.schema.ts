import { z } from "zod";

/** Input provided to the Climate Analyst agent. */
export const analystInputSchema = z.object({
  sectionName: z.string(),
  domainName: z.string(),
  sectionInstructions: z.string(),
  currentSectionDomainBrief: z.string(),
  incomingDataType: z.enum(["weather_observation", "climate_research"]),
  incomingData: z.unknown(),
  /** The `<section>_<domain>_data` column this analysis belongs to. */
  column: z.string(),
});

/** One piece of evidence supporting an analytical decision. */
export const analystEvidenceSchema = z.object({
  description: z.string(),
  source: z.string().optional(),
  url: z.string().optional(),
  date: z.string().optional(),
});

/** One retention/update/exclusion decision for the downstream Writer. */
export const analystDecisionSchema = z.object({
  decision: z.enum([
    "update",
    "strengthen",
    "weaken",
    "new_topic",
    "add_context",
    "track_signal",
    "correct",
    "exclude",
    "retain_uncertain",
  ]),

  /** The topic, situation, trend, or assessment the decision concerns. */
  topic: z.string(),

  /** Why this decision was made, grounded in the brief, instructions, and incoming data. */
  rationale: z.string(),

  /** How the incoming data relates to the current state of the brief. */
  relationshipToBrief: z.string(),

  /** Evidence drawn from the supplied incoming data. */
  evidence: z.array(analystEvidenceSchema),

  confidence: z.enum(["high", "medium", "low"]),

  /** What the Writer should do with this information. */
  writerInstruction: z.string(),
});

/** Complete response from the Climate Analyst. */
export const analystOutputSchema = z.object({
  decisions: z.array(analystDecisionSchema),
  summary: z.string(),
});

export type AnalystInput = z.infer<typeof analystInputSchema>;
export type AnalystEvidence = z.infer<typeof analystEvidenceSchema>;
export type AnalystDecision = z.infer<typeof analystDecisionSchema>;
export type AnalystOutput = z.infer<typeof analystOutputSchema>;

export type AnalystDispatchState = {
  yesterdayIntelligenceSetId: string;
  climateIntelligenceSetId: string;
  jobs: AnalystInput[];
};

export type AnalystNodeInput = {
  yesterdayIntelligenceSetId: string;
  climateIntelligenceSetId: string;
  job: AnalystInput;
};
