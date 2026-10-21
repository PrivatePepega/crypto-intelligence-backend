import { z } from "zod";

export type ResearcherPromptInput = {
  sectionName: string;
  domainName: string;
  climateDomainBrief: string;
};

export const researcherInputSchema = z.object({
  sectionName: z.string(),
  domainName: z.string(),
  climateDomainBrief: z.string(),
  /** The `_data` column in climate.climate_briefs this job came from. */
  column: z.string(),
  sectionInstructions: z.string().optional(),
});

export const researcherFindingSchema = z.object({
  topic: z.string(),
  status: z.enum(["updated", "unchanged", "unverified", "new"]),
  summary: z.string(),
  evidence: z.array(
    z.object({
      description: z.string(),
      source: z.string().optional(),
      url: z.string().optional(),
      publishedAt: z.string().optional(),
      eventDate: z.string().optional(),
    }),
  ),
  reason: z.string().optional(),
});

export const researcherOutputSchema = z.object({
  findings: z.array(researcherFindingSchema),
});

export type ResearcherInput = z.infer<typeof researcherInputSchema>;
export type ResearcherFinding = z.infer<typeof researcherFindingSchema>;
export type ResearcherOutput = z.infer<typeof researcherOutputSchema>;

export type ResearcherDispatchState = {
  yesterdayIntelligenceSetId: string;
  climateIntelligenceSetId: string;
  jobs: ResearcherInput[];
};

export type ResearcherNodeInput = {
  yesterdayIntelligenceSetId: string;
  climateIntelligenceSetId: string;
  job: ResearcherInput;
};
