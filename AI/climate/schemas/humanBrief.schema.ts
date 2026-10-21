import { z } from "zod";

/** Input provided to the Human Brief agent. */
export const humanBriefInputSchema = z.object({
  sectionName: z.string(),
  sectionData: z.unknown(),
  /** The `human_brief_*` column this brief is written to. */
  humanBriefColumn: z.string(),
});

export type HumanBriefInput = z.infer<typeof humanBriefInputSchema>;

export type HumanBriefDispatchState = {
  climateIntelligenceSetId: string;
  jobs: HumanBriefInput[];
};

export type HumanBriefNodeInput = {
  climateIntelligenceSetId: string;
  job: HumanBriefInput;
};
