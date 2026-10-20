import { generateText, Output, NoOutputGeneratedError, wrapLanguageModel, extractJsonMiddleware } from "ai";

import { models } from "../../providers/model.js";

import {
  relevanceRouterInputSchema,
  relevanceRouterOutputSchema,
  type RelevanceRouterInput,
} from "../schemas/relevanceRouter.schema.js";

import { relevanceRouterSystemPrompt } from "../prompts/relevance router/relevanceRouter.prompt.js";

import { createAgentRunLog } from "../../utils/logger.js";
import { modelIdOf, getReasoningText, normalizeStep } from "../../utils/agent.js";
import { createRunCost } from "../../utils/weather/cost.js";

// --------------------------------------------------
// Model wrapping
// --------------------------------------------------
//
// The free router sometimes wraps its JSON in an extra layer of braces:
//   {\n{"relevantObservations": [...]}
// which fails to parse because the outer braces are not valid JSON. The
// middleware below strips that wrapping before the structured-output parser
// sees the text, by finding the first `{` that is followed by a property name
// and slicing from there.
// --------------------------------------------------

const modelPick = wrapLanguageModel({
  model: models.openrouterFree as unknown as Parameters<typeof wrapLanguageModel>[0]["model"],
  middleware: extractJsonMiddleware({
    transform: (text: string): string => {
      // Find the first `{` followed by a quote (a JSON property name) or a
      // bracket (an array value). Everything before that is noise.
      const match = text.match(/\{\s*["\[]/);
      if (match === null) return text;
      return text.slice(match.index ?? 0);
    },
  }),
});

const AGENT_NAME = "Climate Relevance Router";
const MAX_AGENT_ATTEMPTS = 3;

const RETRY_PROMPT_ADDITIONS: Record<number, string> = {
  2: `
RETRY — REASSESS YOUR CLASSIFICATION:
Review the target section and domain again.
Be more selective: include only observations that have a clear,
substantive connection to this specific section and domain.
Do not include observations merely because they are generally
important. Explain the specific relevance of each included item.
Preserve original IDs and observation/research text exactly.
Return only output matching the required schema.
`,
  3: `
FINAL RETRY — APPLY STRICT RELEVANCE FILTERING:
Re-evaluate every candidate independently against the target
section's instructions and the specified domain.
Reject weak, indirect, speculative, or generic connections.
Include an observation only when its relevance is clearly justified.
Do not invent information, IDs, or research, and do not modify
the original observation or research text.
If nothing qualifies, return an empty relevantObservations array.
Return only valid structured output matching the required schema.
`,
};

export async function runRelevanceRouterAgent(
  input: RelevanceRouterInput,
) {
  const validatedInput = relevanceRouterInputSchema.parse(input);

  const runLog = await createAgentRunLog(AGENT_NAME, validatedInput.domain);

  const originalUserPrompt = JSON.stringify(validatedInput);

  // The run's running cost. Fed one call at a time, read back at finish.
  const cost = createRunCost();

  await runLog.record("initializer", {
    section: validatedInput.section,
    domain: validatedInput.domain,
    observationCount: validatedInput.observations.length,
    researchedCount: validatedInput.researchedObservations.length,
    model: modelIdOf(modelPick),
    maxOutputTokens: 60_000,
  });

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt++) {
    const userPrompt =
      attempt === 1
        ? originalUserPrompt
        : `${originalUserPrompt}\n\n${RETRY_PROMPT_ADDITIONS[attempt]}`;

    try {
      console.log(
        `[Relevance Router Agent] ATTEMPT ${attempt}/${MAX_AGENT_ATTEMPTS}`,
      );

      await runLog.record("prompt", {
        attempt,
        prompt: userPrompt,
      });

      const result = await generateText({
        model: modelPick,
        instructions: relevanceRouterSystemPrompt,
        prompt: userPrompt,
        // Reasoning is mandatory for this endpoint, so it cannot be disabled. The
        // model needs enough room to both reason and emit the full JSON response.
        maxOutputTokens: 60_000,

        output: Output.object({
          schema: relevanceRouterOutputSchema,
          name: "relevance_router_analysis",
          description:
            "Identifies observations relevant to a specific Climate section and domain, explaining why each observation is relevant.",
        }),

        onStepEnd: async (step) => {
          await runLog.record("step", normalizeStep(step));
        },
      });

      const output = result.output;

      await runLog.record("output", {
        attempt,
        output,
      });

      // Reasoning, if any.
      const steps = await result.steps;
      let lastReasoningText: string | null = null;
      for (const step of steps) {
        const reasoningText = getReasoningText(step);
        if (reasoningText) {
          lastReasoningText = reasoningText;
        }
      }

      if (lastReasoningText) {
        await runLog.record("reasoning", lastReasoningText);
      }

      const totalUsage = await result.totalUsage;
      const finishReason = result.finishReason;

      await runLog.record("usage", {
        attempt,
        finishReason,
        inputTokens: totalUsage.inputTokens ?? null,
        outputTokens: totalUsage.outputTokens ?? null,
        totalTokens: totalUsage.totalTokens ?? null,
      });

      await runLog.addCost({
        modelId: modelIdOf(modelPick),
        usage: totalUsage,
      });

      console.log(
        `[Relevance Router Agent] SUCCESS | Attempt: ${attempt}`,
      );

      await runLog.finish(JSON.stringify(output));

      return output;
    } catch (error) {
      if (NoOutputGeneratedError.isInstance(error)) {
        console.error(
          "[Relevance Router Agent] No structured output generated.",
          error.cause,
        );
      } else {
        console.error(
          `[Relevance Router Agent] FAILED | Attempt: ${attempt}`,
          error,
        );
      }

      await runLog.record("error", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : typeof error,
      });

      if (attempt === MAX_AGENT_ATTEMPTS) {
        console.error(
          "[Relevance Router Agent] All attempts exhausted.",
        );

        await runLog.finish();

        throw error;
      }

      console.log(
        "[Relevance Router Agent] Retrying with additional prompt instructions...",
      );
    }
  }

  await runLog.finish();

  throw new Error("Relevance Router agent exhausted all attempts.");
}