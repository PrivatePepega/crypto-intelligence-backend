import { z } from "zod";

/**
 * Input to the Chatbot Analyzer.
 *
 * `climateBrief` may be empty: the brief is background context, and the
 * analyzer can still interpret the user's message without one.
 *
 * `climateBriefDate` is the date of the loaded brief, not the current date. It
 * is optional because callers may not have a dated brief.
 */
export const analyzerInputSchema = z.object({
  userQuery: z.string().refine((value) => value.trim().length > 0, "userQuery must not be empty"),
  climateBrief: z.string(),
  climateBriefDate: z.string().optional(),
});

/**
 * The Analyzer's JSON output.
 *
 * The field names are snake_case because they are the exact keys the system
 * prompt asks the model to return.
 */
export const analyzerOutputSchema = z.object({
  user_query: z.string().min(1),
  analyzer_query: z.string().min(1),
  answer_example: z.string().min(1),
});

export type AnalyzerInput = z.infer<typeof analyzerInputSchema>;
export type AnalyzerOutput = z.infer<typeof analyzerOutputSchema>;
