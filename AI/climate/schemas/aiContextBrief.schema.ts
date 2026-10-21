import { z } from "zod";

/** Input provided to the AI Context Brief agent. */
export const aiContextBriefInputSchema = z.object({
  sectionName: z.string(),
  sectionData: z.unknown(),
  /** The `ai_context_brief_*` JSONB column this brief is written to. */
  aiContextBriefColumn: z.string(),
});

/** One domain's compressed context inside a section. */
export const aiContextBriefDomainSchema = z.object({
  domain: z
    .string()
    .describe("The domain name as it appears in the source, for example Geopolitics or Crypto."),
  summary: z
    .string()
    .describe(
      "A dense synthesis of the domain's essential conditions, forces, relationships, and direction.",
    ),
  keyPoints: z
    .array(z.string())
    .describe(
      "Specific facts, figures, dates, entities, or developments essential to understanding the domain.",
    ),
  risks: z
    .array(z.string())
    .describe(
      "Material risks or unresolved uncertainties explicitly supported by the source. Empty when none.",
    ),
});

/** Complete response from the AI Context Brief agent. */
export const aiContextBriefOutputSchema = z.object({
  sectionName: z.string().describe("The section this context brief covers."),
  overview: z
    .string()
    .describe("A compact cross-domain synthesis of the section's most important conditions."),
  domains: z.array(aiContextBriefDomainSchema),
});

export type AIContextBriefInput = z.infer<typeof aiContextBriefInputSchema>;
export type AIContextBriefDomain = z.infer<typeof aiContextBriefDomainSchema>;
export type AIContextBriefOutput = z.infer<typeof aiContextBriefOutputSchema>;

export type AIContextBriefDispatchState = {
  climateIntelligenceSetId: string;
  jobs: AIContextBriefInput[];
};

export type AIContextBriefNodeInput = {
  climateIntelligenceSetId: string;
  job: AIContextBriefInput;
};
