import {
  generateText,
  Output,
  NoOutputGeneratedError,
  wrapLanguageModel,
  extractJsonMiddleware,
} from "ai";

import { models } from "../../providers/model.js";

import {
  aiContextBriefInputSchema,
  aiContextBriefOutputSchema,
  type AIContextBriefInput,
} from "../schemas/aiContextBrief.schema.js";

import {
  AI_CONTEXT_BRIEF_SYSTEM_PROMPT,
  buildAIContextBriefPrompt,
} from "../prompts/ai context brief/aiContextBrief.prompt.js";

import { createAgentRunLog } from "../../utils/logger.js";
import { modelIdOf, getReasoningText, normalizeStep, sleep } from "../../utils/agent.js";

// --------------------------------------------------
// Model wrapping
// --------------------------------------------------
// Prevent the free model from getting confused by extra output / markdown.
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

      // Find the first `{` followed by a quote (a JSON property name)
      const match = t.match(/\{\s*"/);
      if (match === null) {
        const firstBrace = t.indexOf("{");
        if (firstBrace >= 0) return t.slice(firstBrace);
        return t;
      }
      return t.slice(match.index ?? 0);
    },
  }),
});

const AGENT_NAME = "Climate AI Context Brief";
const MAX_AGENT_ATTEMPTS = 8;
const RETRY_DELAY_MS = 4_000;

const RETRY_PROMPT_ADDITIONS: Record<number, string> = {
  2: `
RETRY — COMPRESS HARDER:
Your previous synthesis was too close to the source. Remove repetition, secondary detail, and explanation that does not improve understanding.
Keep the essential conditions, relationships, and conclusions. Every retained statement must add useful context.
Return ONLY valid JSON matching the required schema.
`,
  3: `
RETRY — PRESERVE RELATIONSHIPS AND STRUCTURE:
Do not merely list facts. Preserve the causal and structural relationships the source establishes, and keep each domain's identity distinct.
Do not merge domains into one undifferentiated summary. Use labels another AI agent can retrieve and interpret.
Return ONLY valid JSON matching the required schema.
`,
  4: `
RETRY — STAY FAITHFUL TO THE SOURCE:
Use only the supplied Raw Intelligence. Do not add outside facts, invent missing context, or generate new analysis.
Do not turn correlation into causation, a possibility into a certainty, or a forecast into an established fact.
Return ONLY valid JSON matching the required schema.
`,
  5: `
RETRY — PRESERVE TIME AND UNCERTAINTY:
Keep the temporal distinctions the source makes: current conditions, established structural characteristics, recent developments, and potential outcomes.
Preserve material risks, unresolved developments, and important qualifications.
Do not present outdated conditions as current. Return ONLY valid JSON matching the required schema.
`,
  6: `
RETRY — COVER THE ESSENTIAL SECTION CONTENT:
Make sure every domain and major theme present in the input is represented in the output.
Do not silently drop a domain. Do not pad the output with minor developments to appear complete.
Return ONLY valid JSON matching the required schema.
`,
  7: `
RETRY — RETURN VALID STRUCTURED OUTPUT:
Your previous response could not be parsed. Return exactly one JSON object matching the required schema.
No markdown fences, no commentary, and no text outside the object. Do not return the JSON as a string.
`,
  8: `
FINAL RETRY — LAST CHANCE:
This is your final attempt (8th total). Return the most compact faithful synthesis you can.
If the source does not support a conclusion, omit it rather than inventing one.
Return ONLY a single valid JSON object matching the required schema.
`,
};

export async function runAIContextBriefAgent(input: AIContextBriefInput) {
  const validatedInput = aiContextBriefInputSchema.parse(input);

  const runLog = await createAgentRunLog(AGENT_NAME, validatedInput.sectionName);

  const originalUserPrompt = buildAIContextBriefPrompt(validatedInput);

  const sectionDataChars =
    typeof validatedInput.sectionData === "string"
      ? validatedInput.sectionData.length
      : JSON.stringify(validatedInput.sectionData).length;

  await runLog.record("initializer", {
    sectionName: validatedInput.sectionName,
    sectionDataChars,
    model: modelIdOf(modelPick),
    maxOutputTokens: 100_000,
  });

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt++) {
    const userPrompt =
      attempt === 1
        ? originalUserPrompt
        : `${originalUserPrompt}\n\n${RETRY_PROMPT_ADDITIONS[attempt]}`;

    try {
      console.log(`[Climate AI Context Brief Agent] ATTEMPT ${attempt}/${MAX_AGENT_ATTEMPTS}`);

      await runLog.record("prompt", {
        attempt,
        prompt: userPrompt,
      });

      const result = await generateText({
        model: modelPick,
        instructions: AI_CONTEXT_BRIEF_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 100_000,
        temperature: 0,

        tools: {},
        toolChoice: "none",

        output: Output.object({
          schema: aiContextBriefOutputSchema,
          name: "climate_ai_context_brief",
          description:
            "A compact, information-dense context brief for downstream AI agents, preserving the section's essential conditions, relationships, and risks.",
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

      console.log(`[Climate AI Context Brief Agent] SUCCESS | Attempt: ${attempt}`);

      await runLog.finish(JSON.stringify(output));

      return output;
    } catch (error) {
      if (NoOutputGeneratedError.isInstance(error)) {
        const cause = error.cause instanceof Error ? error.cause : null;
        const name = cause?.name ?? "Error";
        const message = cause?.message ?? "No structured output generated.";
        console.error(
          `[Climate AI Context Brief Agent] No structured output generated: ${name}: ${message}`,
        );
      } else {
        const name = error instanceof Error ? error.name : "Error";
        const message = error instanceof Error ? error.message : String(error);
        const truncated = message.length > 200 ? message.slice(0, 200) + "..." : message;
        console.error(
          `[Climate AI Context Brief Agent] FAILED | Attempt: ${attempt} — ${name}: ${truncated}`,
        );
      }

      await runLog.record("error", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : typeof error,
      });

      if (attempt === MAX_AGENT_ATTEMPTS) {
        console.error("[Climate AI Context Brief Agent] All attempts exhausted.");

        await runLog.finish();

        throw error;
      }

      console.log("[Climate AI Context Brief Agent] Waiting 4 seconds before retry...");
      await sleep(RETRY_DELAY_MS);
    }
  }

  await runLog.finish();

  throw new Error("Climate AI Context Brief agent exhausted all attempts.");
}
