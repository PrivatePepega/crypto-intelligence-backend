import {
  generateText,
  Output,
  NoOutputGeneratedError,
  wrapLanguageModel,
  extractJsonMiddleware,
} from "ai";

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
      let t = text;

      // Strip markdown code fences if present
      t = t.replace(/^```(?:json)?\s*/i, "");
      t = t.replace(/\s*```$/i, "");
      t = t.replace(/```(?:json)?/gi, "");

      // Find the first `{` followed by a quote (a JSON property name). Skip arrays at root.
      const match = t.match(/\{\s*"/);
      if (match === null) {
        // Fallback: just find first {
        const firstBrace = t.indexOf("{");
        if (firstBrace >= 0) return t.slice(firstBrace);
        return t;
      }
      return t.slice(match.index ?? 0);
    },
  }),
});

const AGENT_NAME = "Climate Relevance Router";
const MAX_AGENT_ATTEMPTS = 5;

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
RETRY — APPLY STRICT RELEVANCE FILTERING:
Re-evaluate every candidate independently against the target
section's instructions and the specified domain.
Reject weak, indirect, speculative, or generic connections.
Include an observation only when its relevance is clearly justified.
Do not invent information, IDs, or research, and do not modify
the original observation or research text.
If nothing qualifies, return an empty relevantObservations array.
Return only valid structured output matching the required schema.
`,
  4: `
RETRY — FINAL CLASSIFICATION ATTEMPT:
This is the fourth attempt (3rd retry). Be extremely strict: an observation
qualifies only if its connection to the section is direct and
documented in the section's own criteria. Reject anything that
requires inference to connect. Preserve original IDs and text
exactly. Return only valid structured output matching the
required schema. Output MUST be a single valid JSON object.
`,
  5: `
FINAL RETRY — LAST CHANCE:
This is the final attempt (5th total). Return only observations whose
relevance is undeniable and directly supported by the section
instructions. If nothing qualifies, return an empty
relevantObservations array. Do not invent information, IDs, or
research. Return only a single valid JSON object matching the required schema.
`,
};

export async function runRelevanceRouterAgent(input: RelevanceRouterInput) {
  const validatedInput = relevanceRouterInputSchema.parse(input);

  // The file name includes both the observation domain and the climate section, so each
  // section/domain combination gets its own numbered sequence rather than overwriting.
  const runLog = await createAgentRunLog(
    AGENT_NAME,
    `${validatedInput.section}-${validatedInput.domain}`,
  );

  const originalUserPrompt = JSON.stringify(validatedInput);

  // The run's running cost. Fed one call at a time, read back at finish.
  const cost = createRunCost();

  await runLog.record("initializer", {
    section: validatedInput.section,
    domain: validatedInput.domain,
    observationCount: validatedInput.observations.length,
    researchedCount: validatedInput.researchedObservations.length,
    model: modelIdOf(modelPick),
    maxOutputTokens: 100_000,
  });

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt++) {
    const userPrompt =
      attempt === 1
        ? originalUserPrompt
        : `${originalUserPrompt}\n\n${RETRY_PROMPT_ADDITIONS[attempt]}`;

    try {
      console.log(`[Relevance Router Agent] ATTEMPT ${attempt}/${MAX_AGENT_ATTEMPTS}`);

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
        maxOutputTokens: 100_000,
        temperature: 0,

        // Prevent the model/provider from calling tools (avoids OpenRouter/free
        // routing to providers that try to invoke non-existent functions).
        tools: {},
        toolChoice: "none",

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

      console.log(`[Relevance Router Agent] SUCCESS | Attempt: ${attempt}`);

      await runLog.finish(JSON.stringify(output));

      return output;
    } catch (error) {
      if (NoOutputGeneratedError.isInstance(error)) {
        const cause = error.cause instanceof Error ? error.cause : null;
        const name = cause?.name ?? "Error";
        const message = cause?.message ?? "No structured output generated.";
        // Only the error name and message — not the full stack or the raw response text.
        console.error(
          `[Relevance Router Agent] No structured output generated: ${name}: ${message}`,
        );
      } else {
        const name = error instanceof Error ? error.name : "Error";
        const message = error instanceof Error ? error.message : String(error);
        // Truncate very long messages
        const truncated = message.length > 200 ? message.slice(0, 200) + "..." : message;
        console.error(
          `[Relevance Router Agent] FAILED | Attempt: ${attempt} — ${name}: ${truncated}`,
        );
      }

      await runLog.record("error", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : typeof error,
      });

      if (attempt === MAX_AGENT_ATTEMPTS) {
        console.error("[Relevance Router Agent] All attempts exhausted.");

        await runLog.finish();

        throw error;
      }

      console.log("[Relevance Router Agent] Retrying with additional prompt instructions...");
    }
  }

  await runLog.finish();

  throw new Error("Relevance Router agent exhausted all attempts.");
}
