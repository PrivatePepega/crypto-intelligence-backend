import { z } from "zod";

const nonEmptyString = (field: string) =>
  z.string().refine((value) => value.trim().length > 0, `${field} must not be empty`);

/**
 * Input to the Chatbot Answer Generator.
 *
 * `climateBrief` may be empty: the brief is background context, and the answer
 * can still be generated from the query and researcher output without one.
 *
 * `researcherOutput` is the Researcher's plain-text research package, not a
 * JSON object.
 *
 * `toolNames` is optional. When omitted the agent uses its default verification
 * tool set; a caller can pass a narrower or domain-specific set of names from
 * the shared `agenticTooling` registry.
 *
 * `climateBriefDate` is the date of the loaded brief, not the current date.
 *
 * `answerExample`, `retryAttempt`, `maxAttempts`, `retryFeedback`, and
 * `previousAnswer` are optional graph-level context. The agent's own eight
 * attempts handle malformed generations; these fields describe a separate
 * retry after the Answer Checker rejected an otherwise well-formed answer.
 */
export const answerGeneratorInputSchema = z.object({
  userQuery: nonEmptyString("userQuery"),
  analyzerQuery: nonEmptyString("analyzerQuery"),
  researcherOutput: z.string(),
  climateBrief: z.string(),
  climateBriefDate: z.string().optional(),
  answerExample: z.string().optional(),
  toolNames: z.array(z.string()).min(1).optional(),
  retryAttempt: z.number().int().positive().optional(),
  maxAttempts: z.number().int().positive().optional(),
  retryFeedback: z.string().optional(),
  previousAnswer: z.string().optional(),
});

export type AnswerGeneratorInput = z.infer<typeof answerGeneratorInputSchema>;

/** The Answer Generator returns one user-facing string, not structured data. */
export type AnswerGeneratorOutput = string;
