import {
  generateText,
  Output,
  NoOutputGeneratedError,
  wrapLanguageModel,
  extractJsonMiddleware,
} from "ai";

import { models } from "../../providers/model.js";

import {
  analystInputSchema,
  analystOutputSchema,
  type AnalystInput,
} from "../schemas/analyst.schema.js";

import {
  ANALYST_SYSTEM_PROMPT,
  buildAnalystPrompt,
} from "../prompts/prompt analyst/analyst.prompt.js";

import { createAgentRunLog } from "../../utils/logger.js";
import { modelIdOf, getReasoningText, normalizeStep } from "../../utils/agent.js";

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

const AGENT_NAME = "Climate Analyst";
const MAX_AGENT_ATTEMPTS = 7;

const RETRY_PROMPT_ADDITIONS: Record<number, string> = {
  2: `
RETRY — REASSESS SECTION AND DOMAIN FIT:
Review the target section, domain, and Section Instructions before deciding anything.
Some information is important in general without belonging in this section. Do not force it in.
Exclude anything that is outside the section's scope or the assigned domain.
Return ONLY valid JSON matching the required schema.
`,
  3: `
RETRY — FOCUS ON INCREMENTAL VALUE:
Ask what this incoming data adds beyond what the current brief already contains.
Reject repeated headlines, duplicate facts, redundant explanations, and details that do not improve the record.
Retain information only when it materially improves accuracy, completeness, specificity, or understanding.
If it adds nothing, return an exclusion decision instead of manufacturing analysis.
Return ONLY valid JSON matching the required schema.
`,
  4: `
RETRY — GROUND EVERY DECISION IN EVIDENCE:
Separate reported facts from interpretations, projections, allegations, and uncertain claims.
Do not invent evidence, statistics, dates, causal relationships, or conclusions.
When the evidence supports only a tentative interpretation, preserve that uncertainty.
When the incoming data conflicts with the existing brief, identify the conflict rather than silently accepting or defending either side.
Return ONLY valid JSON matching the required schema.
`,
  5: `
RETRY — PRESERVE CONTINUITY:
The existing brief is the baseline, not an untouchable source of truth.
Do not recommend removing established context merely because the latest incoming data does not mention it.
Distinguish clearly between adding new information, updating existing information, qualifying or correcting it, and leaving it unchanged.
Include a concrete writerInstruction for every retained decision.
Return ONLY valid JSON matching the required schema.
`,
  6: `
RETRY — APPLY STRICT ANALYST DISCIPLINE:
This is your 6th attempt. You are an ANALYST, not a researcher or writer.
Do not conduct research, do not invent sources, and do not write or regenerate the section.
Do not merely summarize the incoming data; make retention decisions and explain them.
Every recommendation must be grounded in the supplied brief, Section Instructions, and incoming data.
Return ONLY valid JSON matching the required schema.
`,
  7: `
FINAL RETRY — LAST CHANCE:
This is your final attempt. If the incoming data provides no meaningful value, return an exclusion or no-change decision.
Do NOT fabricate analysis or updates to produce a nonempty result.
If the evidence is uncertain or insufficient, represent that limitation explicitly.
Be precise, conservative, and evidence-grounded. Return ONLY a single valid JSON object matching the required schema.
`,
};

export async function runAnalystAgent(input: AnalystInput) {
  const validatedInput = analystInputSchema.parse(input);

  const runLog = await createAgentRunLog(
    AGENT_NAME,
    `${validatedInput.sectionName}-${validatedInput.domainName}`,
  );

  const originalUserPrompt = buildAnalystPrompt(validatedInput);

  await runLog.record("initializer", {
    sectionName: validatedInput.sectionName,
    domainName: validatedInput.domainName,
    column: validatedInput.column ?? null,
    incomingDataType: validatedInput.incomingDataType,
    model: modelIdOf(modelPick),
    maxOutputTokens: 100_000,
  });

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt++) {
    const userPrompt =
      attempt === 1
        ? originalUserPrompt
        : `${originalUserPrompt}\n\n${RETRY_PROMPT_ADDITIONS[attempt]}`;

    try {
      console.log(`[Climate Analyst Agent] ATTEMPT ${attempt}/${MAX_AGENT_ATTEMPTS}`);

      await runLog.record("prompt", {
        attempt,
        prompt: userPrompt,
      });

      const result = await generateText({
        model: modelPick,
        instructions: ANALYST_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 100_000,
        temperature: 0,

        tools: {},
        toolChoice: "none",

        output: Output.object({
          schema: analystOutputSchema,
          name: "climate_analyst_decisions",
          description:
            "Analytical retention decisions for the Climate Brief: what to update, add, qualify, correct, exclude, or leave unchanged.",
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

      console.log(`[Climate Analyst Agent] SUCCESS | Attempt: ${attempt}`);

      await runLog.finish(JSON.stringify(output));

      return output;
    } catch (error) {
      if (NoOutputGeneratedError.isInstance(error)) {
        const cause = error.cause instanceof Error ? error.cause : null;
        const name = cause?.name ?? "Error";
        const message = cause?.message ?? "No structured output generated.";
        console.error(
          `[Climate Analyst Agent] No structured output generated: ${name}: ${message}`,
        );
      } else {
        const name = error instanceof Error ? error.name : "Error";
        const message = error instanceof Error ? error.message : String(error);
        const truncated = message.length > 200 ? message.slice(0, 200) + "..." : message;
        console.error(
          `[Climate Analyst Agent] FAILED | Attempt: ${attempt} — ${name}: ${truncated}`,
        );
      }

      await runLog.record("error", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : typeof error,
      });

      if (attempt === MAX_AGENT_ATTEMPTS) {
        console.error("[Climate Analyst Agent] All attempts exhausted.");

        await runLog.finish();

        throw error;
      }

      console.log("[Climate Analyst Agent] Retrying with additional prompt instructions...");
    }
  }

  await runLog.finish();

  throw new Error("Climate Analyst agent exhausted all attempts.");
}
