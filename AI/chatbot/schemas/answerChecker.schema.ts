import { z } from "zod";

const nonEmptyString = (field: string) =>
  z.string().refine((value) => value.trim().length > 0, `${field} must not be empty`);

/**
 * Input to the Chatbot Answer Checker.
 *
 * `answer` is intentionally allowed to be empty. An empty answer is a valid
 * input to the checker: the prompt instructs it to return the exact fallback
 * sentence when the supplied answer cannot be made usable.
 */
export const answerCheckerInputSchema = z.object({
  userQuery: nonEmptyString("userQuery"),
  analyzerQuery: nonEmptyString("analyzerQuery"),
  answer: z.string(),
});

export type AnswerCheckerInput = z.infer<typeof answerCheckerInputSchema>;

/** The Answer Checker returns one final user-facing string. */
export type AnswerCheckerOutput = string;
