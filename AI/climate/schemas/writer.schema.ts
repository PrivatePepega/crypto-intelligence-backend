import { z } from "zod";

/** Input provided to the Climate Writer agent. */
export const writerInputSchema = z.object({
  sectionName: z.string(),
  domainName: z.string(),
  sectionInstructions: z.string(),
  previousSectionDomainBrief: z.string(),
  analystNotes: z.unknown(),
  /** The `<section>_<domain>_data` column this brief belongs to. */
  column: z.string(),
});

/** Complete response from the Climate Writer. */
export const writerOutputSchema = z.object({
  brief: z
    .string()
    .min(1)
    .describe("The complete updated Climate Domain Brief for the assigned section and domain."),
});

export type WriterInput = z.infer<typeof writerInputSchema>;
export type WriterOutput = z.infer<typeof writerOutputSchema>;

export type WriterDispatchState = {
  yesterdayIntelligenceSetId: string;
  climateIntelligenceSetId: string;
  jobs: WriterInput[];
};

export type WriterNodeInput = {
  yesterdayIntelligenceSetId: string;
  climateIntelligenceSetId: string;
  job: WriterInput;
};
