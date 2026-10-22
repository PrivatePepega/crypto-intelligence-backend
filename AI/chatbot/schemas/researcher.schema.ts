import { z } from "zod";

/**
 * Input to the Chatbot Researcher.
 *
 * `climateBrief` may be empty: the brief is background context, and the
 * researcher can still investigate the query without one.
 *
 * `toolNames` is optional. When omitted the agent uses its default research
 * tool set; a caller can pass a narrower or domain-specific set of names from
 * the shared `agenticTooling` registry.
 *
 * `climateBriefDate` is the date of the loaded brief, not the current date.
 */
export const researcherInputSchema = z.object({
  userQuery: z.string().refine((value) => value.trim().length > 0, "userQuery must not be empty"),
  analyzerQuery: z
    .string()
    .refine((value) => value.trim().length > 0, "analyzerQuery must not be empty"),
  climateBrief: z.string(),
  climateBriefDate: z.string().optional(),
  toolNames: z.array(z.string()).min(1).optional(),
});

/**
 * The Researcher's output.
 *
 * The agent returns a plain-text research package. The prompt deliberately
 * leaves the structure open, so headings, bullet points, tables, and prose are
 * all valid.
 */
export type ResearcherOutput = string;

export type ResearcherInput = z.infer<typeof researcherInputSchema>;
