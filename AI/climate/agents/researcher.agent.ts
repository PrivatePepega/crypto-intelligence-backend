import {
  generateText,
  Output,
  NoOutputGeneratedError,
  wrapLanguageModel,
  extractJsonMiddleware,
} from "ai";

import { models } from "../../providers/model.js";

import {
  researcherInputSchema,
  researcherOutputSchema,
  type ResearcherInput,
} from "../schemas/researcher.schema.js";

import { RESEARCHER_SYSTEM_PROMPT } from "../prompts/researcher/researcher.prompt.js";

import { createAgentRunLog } from "../../utils/logger.js";
import { modelIdOf, getReasoningText, normalizeStep, sleep } from "../../utils/agent.js";
import { createRunCost } from "../../utils/weather/cost.js";

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

const AGENT_NAME = "Climate Researcher";
const MAX_AGENT_ATTEMPTS = 8;
const RETRY_DELAY_MS = 4_000;

const RETRY_PROMPT_ADDITIONS: Record<number, string> = {
  2: `
RETRY — FOCUS ON EVIDENCE:
You must actually research the topics. Do not guess. Look for concrete events, announcements, data releases, or decisions since the last update.
Only report developments you can back up with evidence. If you found nothing meaningful after checking, say so explicitly.
Return ONLY valid JSON matching the required schema.
`,
  3: `
RETRY — BE STRICT ABOUT UPDATES:
Only report a situation as changed if there is a clear, material development. Minor headlines, rehashes, or speculation do NOT count.
If a situation hasn't meaningfully changed, mark it as unchanged with a short reason.
If you cannot verify it, mark it as unverified and state the evidence gap.
Do not invent facts, sources, or dates. Return ONLY valid JSON matching the required schema.
`,
  4: `
RETRY — VERIFY BEFORE REPORTING:
This is your 4th attempt. Double check every claim. For each finding include what changed, when it happened (if known), and why it matters.
Only include updates that affect the specific section and domain. Ignore unrelated news.
If evidence is weak or missing, say UNVERIFIED with details. Return ONLY valid JSON matching the required schema.
`,
  5: `
RETRY — CHECK COVERAGE:
Make sure every topic in the current brief received an explicit finding: updated, unchanged, unverified, or new.
Do not silently drop topics. Do not pad the findings with entries that say nothing.
Keep every finding inside the assigned section and domain. Return ONLY valid JSON matching the required schema.
`,
  6: `
RETRY — REPORT UNCHANGED HONESTLY:
If a topic has not meaningfully changed, say so with a short reason instead of inventing an update.
If you could not verify something, mark it unverified and state the evidence gap.
Only report developments you can support with evidence. Return ONLY valid JSON matching the required schema.
`,
  7: `
RETRY — RETURN VALID STRUCTURED OUTPUT:
Your previous response could not be parsed. Return exactly one JSON object matching the required schema: a single "findings" array.
No markdown fences, no commentary, and no text before or after the object. Every finding must include the required fields.
`,
  8: `
FINAL RETRY — LAST CHANCE:
This is your final attempt (8th total). Be brutally honest. If there are NO meaningful updates after thorough research, return findings showing no change with explanations. Do NOT fabricate updates.
Only report what you actually found. Be precise and factual. Return ONLY a single valid JSON object matching the required schema.
`,
};

export async function runResearcherAgent(input: ResearcherInput) {
  const validatedInput = researcherInputSchema.parse(input);

  const runLog = await createAgentRunLog(
    AGENT_NAME,
    `${validatedInput.sectionName}-${validatedInput.domainName}`,
  );

  const originalUserPrompt = JSON.stringify(validatedInput);

  const cost = createRunCost();

  await runLog.record("initializer", {
    sectionName: validatedInput.sectionName,
    domainName: validatedInput.domainName,
    model: modelIdOf(modelPick),
    maxOutputTokens: 100_000,
  });

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt++) {
    const userPrompt =
      attempt === 1
        ? originalUserPrompt
        : `${originalUserPrompt}\n\n${RETRY_PROMPT_ADDITIONS[attempt]}`;

    try {
      console.log(`[Climate Researcher Agent] ATTEMPT ${attempt}/${MAX_AGENT_ATTEMPTS}`);

      await runLog.record("prompt", {
        attempt,
        prompt: userPrompt,
      });

      const result = await generateText({
        model: modelPick,
        instructions: RESEARCHER_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 100_000,
        temperature: 0,

        tools: {},
        toolChoice: "none",

        output: Output.object({
          schema: researcherOutputSchema,
          name: "climate_researcher_findings",
          description:
            "Research findings for existing climate brief topics - updates, changes, or confirmation of status.",
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

      console.log(`[Climate Researcher Agent] SUCCESS | Attempt: ${attempt}`);

      await runLog.finish(JSON.stringify(output));

      return output;
    } catch (error) {
      if (NoOutputGeneratedError.isInstance(error)) {
        const cause = error.cause instanceof Error ? error.cause : null;
        const name = cause?.name ?? "Error";
        const message = cause?.message ?? "No structured output generated.";
        console.error(
          `[Climate Researcher Agent] No structured output generated: ${name}: ${message}`,
        );
      } else {
        const name = error instanceof Error ? error.name : "Error";
        const message = error instanceof Error ? error.message : String(error);
        const truncated = message.length > 200 ? message.slice(0, 200) + "..." : message;
        console.error(
          `[Climate Researcher Agent] FAILED | Attempt: ${attempt} — ${name}: ${truncated}`,
        );
      }

      await runLog.record("error", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : typeof error,
      });

      if (attempt === MAX_AGENT_ATTEMPTS) {
        console.error("[Climate Researcher Agent] All attempts exhausted.");

        await runLog.finish();

        throw error;
      }

      console.log("[Climate Researcher Agent] Waiting 4 seconds before retry...");
      await sleep(RETRY_DELAY_MS);
    }
  }

  await runLog.finish();

  throw new Error("Climate Researcher agent exhausted all attempts.");
}
