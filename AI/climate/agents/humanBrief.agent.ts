import { generateText } from "ai";

import { models } from "../../providers/model.js";

import { humanBriefInputSchema, type HumanBriefInput } from "../schemas/humanBrief.schema.js";

import {
  HUMAN_BRIEF_SYSTEM_PROMPT,
  buildHumanBriefPrompt,
} from "../prompts/human brief/humanBrief.prompt.js";

import { createAgentRunLog } from "../../utils/logger.js";
import { modelIdOf, getReasoningText, normalizeStep, sleep } from "../../utils/agent.js";

const AGENT_NAME = "Climate Human Brief";
const MAX_AGENT_ATTEMPTS = 8;
const RETRY_DELAY_MS = 4_000;

const RETRY_PROMPT_ADDITIONS: Record<number, string> = {
  2: `
RETRY — TIGHTEN TO THE CORE STORY:
Your previous brief was too long or too close to the source. Remove secondary detail, repetition, and explanation the reader does not need.
Keep the central narrative of each domain. One to three concise paragraphs per domain.
Return ONLY the complete synthesized brief.
`,
  3: `
RETRY — WRITE FOR A HUMAN READER:
Use a readable narrative, not a collection of disconnected facts or bullet points.
Connect related ideas, keep sentences clear, and explain specialized terms briefly when needed.
Use bullets only when they materially improve readability.
Return ONLY the complete synthesized brief.
`,
  4: `
RETRY — PRESERVE MEANING AND QUALIFICATIONS:
Do not distort the source to make it shorter. Preserve important distinctions, time horizons, and causal relationships.
Do not turn a tentative possibility into a certainty or correlation into causation.
Return ONLY the complete synthesized brief.
`,
  5: `
RETRY — COVER ALL SIX DOMAINS:
Represent every domain present in the input with its own clear heading and one to three paragraphs.
Do not merge domains into one undifferentiated narrative, and do not drop a domain that the source covers.
Return ONLY the complete synthesized brief.
`,
  6: `
RETRY — STAY FAITHFUL TO THE SOURCE:
Use only the supplied Climate Brief section. Do not browse, introduce outside information, or invent missing context.
Never fabricate facts, statistics, dates, events, sources, or conclusions.
Return ONLY the complete synthesized brief.
`,
  7: `
RETRY — RETURN ONLY THE BRIEF:
Your previous response included commentary, reasoning, or formatting outside the brief. Return the complete synthesized brief itself.
Use clear headings and proper spacing. No introduction, explanation, or code fences.
`,
  8: `
FINAL RETRY — LAST CHANCE:
This is your final attempt (8th total). Return the complete synthesized brief for the assigned section and nothing else.
If the source does not support a point, omit it rather than inventing one. Preserve the essential story of every domain.
Return ONLY the brief itself.
`,
};

/**
 * Removes a single code fence wrapping the entire response.
 *
 * The human brief is plain Markdown. Some models still wrap the whole document
 * in ```markdown ... ```, which would otherwise be stored verbatim. Only an
 * outer fence is stripped; fenced blocks inside the document are left untouched.
 */
function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);

  return match?.[1]?.trim() ?? trimmed;
}

export async function runHumanBriefAgent(input: HumanBriefInput): Promise<string> {
  const validatedInput = humanBriefInputSchema.parse(input);

  const runLog = await createAgentRunLog(AGENT_NAME, validatedInput.sectionName);

  const originalUserPrompt = buildHumanBriefPrompt(validatedInput);

  const sectionDataChars =
    typeof validatedInput.sectionData === "string"
      ? validatedInput.sectionData.length
      : JSON.stringify(validatedInput.sectionData).length;

  await runLog.record("initializer", {
    sectionName: validatedInput.sectionName,
    sectionDataChars,
    model: modelIdOf(models.openrouterFree),
    maxOutputTokens: 100_000,
  });

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt++) {
    const userPrompt =
      attempt === 1
        ? originalUserPrompt
        : `${originalUserPrompt}\n\n${RETRY_PROMPT_ADDITIONS[attempt]}`;

    try {
      console.log(`[Climate Human Brief Agent] ATTEMPT ${attempt}/${MAX_AGENT_ATTEMPTS}`);

      await runLog.record("prompt", {
        attempt,
        prompt: userPrompt,
      });

      const result = await generateText({
        model: models.openrouterFree,
        instructions: HUMAN_BRIEF_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 100_000,
        temperature: 0,

        tools: {},
        toolChoice: "none",

        onStepEnd: async (step) => {
          await runLog.record("step", normalizeStep(step));
        },
      });

      const output = stripOuterCodeFence(result.text);

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
        modelId: modelIdOf(models.openrouterFree),
        usage: totalUsage,
      });

      if (output.length === 0) {
        throw new Error("Human Brief agent returned an empty brief.");
      }

      console.log(`[Climate Human Brief Agent] SUCCESS | Attempt: ${attempt}`);

      await runLog.finish(output);

      return output;
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : String(error);
      const truncated = message.length > 200 ? message.slice(0, 200) + "..." : message;

      console.error(
        `[Climate Human Brief Agent] FAILED | Attempt: ${attempt} — ${name}: ${truncated}`,
      );

      await runLog.record("error", {
        attempt,
        error: message,
        name: error instanceof Error ? error.name : typeof error,
      });

      if (attempt === MAX_AGENT_ATTEMPTS) {
        console.error("[Climate Human Brief Agent] All attempts exhausted.");

        await runLog.finish();

        throw error;
      }

      console.log("[Climate Human Brief Agent] Waiting 4 seconds before retry...");
      await sleep(RETRY_DELAY_MS);
    }
  }

  await runLog.finish();

  throw new Error("Climate Human Brief agent exhausted all attempts.");
}
