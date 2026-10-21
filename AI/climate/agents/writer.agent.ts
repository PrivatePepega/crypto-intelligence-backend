import {
  generateText,
  Output,
  NoOutputGeneratedError,
  wrapLanguageModel,
  extractJsonMiddleware,
} from "ai";

import { models } from "../../providers/model.js";

import {
  writerInputSchema,
  writerOutputSchema,
  type WriterInput,
  type WriterOutput,
} from "../schemas/writer.schema.js";

import { WRITER_SYSTEM_PROMPT, buildWriterPrompt } from "../prompts/writer/writer.prompt.js";

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

const AGENT_NAME = "Climate Writer";
const MAX_AGENT_ATTEMPTS = 8;
const RETRY_DELAY_MS = 4_000;

const RETRY_PROMPT_ADDITIONS: Record<number, string> = {
  2: `
RETRY — FOLLOW THE SECTION INSTRUCTIONS:
Re-read the Section Instructions before writing. They define the section's purpose, scope, content priorities, and expected structure.
Do not borrow the responsibilities of another section. Do not include information that does not belong in this section and domain.
Preserve the previous brief's heading hierarchy, organization, terminology, and level of detail unless the Section Instructions require otherwise.
Return ONLY valid JSON matching the required schema, with the complete brief in the "brief" field.
`,
  3: `
RETRY — PRESERVE THE PREVIOUS BRIEF:
Yesterday's brief is the foundation of today's version, not a draft to replace.
Keep established context, persistent conditions, ongoing situations, and structural relationships that remain valid.
Do not remove useful information merely because today's Analyst Notes did not mention it.
Make targeted revisions instead of regenerating unrelated parts of the document.
Return ONLY valid JSON matching the required schema, with the complete brief in the "brief" field.
`,
  4: `
RETRY — DO NOT MANUFACTURE CHANGE:
This is your 4th attempt. Some days produce important developments; most days produce minor updates or none at all.
Do not rewrite the brief merely to make it look different, and do not manufacture change to fill space.
Distinguish between a new event and a genuine change in the underlying situation.
If the Analyst Notes do not justify a revision, return the previous brief substantially unchanged.
Return ONLY valid JSON matching the required schema, with the complete brief in the "brief" field.
`,
  5: `
RETRY — FACTUAL INTEGRITY:
Use only the previous brief, the Section Instructions, and the Analyst Notes. Do not research, guess, or introduce outside information.
Never invent facts, events, statistics, dates, quotations, sources, or causal relationships.
Preserve uncertainty and qualifications when the supplied material does not justify a firm conclusion.
If the Analyst Notes conflict with established information, reflect the correction only when the notes provide a sufficient basis; otherwise keep the uncertainty visible.
Return ONLY valid JSON matching the required schema, with the complete brief in the "brief" field.
`,
  6: `
RETRY — WRITER DISCIPLINE:
This is your 6th attempt. You are a WRITER, not a researcher or analyst.
Do not repeat the analytical process, do not include internal commentary or reasoning, and do not paste the Analyst Notes into the document.
Express the Analyst's decisions as a coherent intelligence brief, integrating new material into the appropriate existing parts of the document.
Do not return a change log, an explanation of your edits, or a summary of the notes.
Return ONLY valid JSON matching the required schema, with the complete brief in the "brief" field.
`,
  7: `
RETRY — COMPLETE, WELL-FORMED JSON:
Your previous response was incomplete or could not be parsed. Return exactly one JSON object matching the required schema, with the complete updated brief in the "brief" field.
No markdown fences, no commentary, and no text before or after the object.
The "brief" field must contain the whole document, not only the paragraphs that changed.
`,
  8: `
FINAL RETRY — LAST CHANCE:
This is your final attempt (8th total). Return the complete Climate Domain Brief for the assigned section and domain, and nothing else.
Start from the previous brief and preserve what remains valid. Incorporate only the Analyst Notes that materially improve it.
If no meaningful changes are warranted, return the previous brief substantially unchanged rather than inventing updates.
Do not wrap the JSON in code fences or include introductory remarks, acknowledgments, or commentary outside the JSON object.
Return ONLY a single valid JSON object matching the required schema, with the complete brief in the "brief" field.
`,
};

export async function runWriterAgent(input: WriterInput): Promise<WriterOutput> {
  const validatedInput = writerInputSchema.parse(input);

  const runLog = await createAgentRunLog(
    AGENT_NAME,
    `${validatedInput.sectionName}-${validatedInput.domainName}`,
  );

  const originalUserPrompt = buildWriterPrompt(validatedInput);

  await runLog.record("initializer", {
    sectionName: validatedInput.sectionName,
    domainName: validatedInput.domainName,
    column: validatedInput.column,
    model: modelIdOf(modelPick),
    maxOutputTokens: 100_000,
  });

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt++) {
    const userPrompt =
      attempt === 1
        ? originalUserPrompt
        : `${originalUserPrompt}\n\n${RETRY_PROMPT_ADDITIONS[attempt]}`;

    try {
      console.log(`[Climate Writer Agent] ATTEMPT ${attempt}/${MAX_AGENT_ATTEMPTS}`);

      await runLog.record("prompt", {
        attempt,
        prompt: userPrompt,
      });

      const result = await generateText({
        model: modelPick,
        instructions: WRITER_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 100_000,
        temperature: 0,

        tools: {},
        toolChoice: "none",

        output: Output.object({
          schema: writerOutputSchema,
          name: "climate_writer_brief",
          description:
            "The complete updated Climate Domain Brief for the assigned section and domain.",
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

      console.log(`[Climate Writer Agent] SUCCESS | Attempt: ${attempt}`);

      await runLog.finish(JSON.stringify(output));

      return output;
    } catch (error) {
      if (NoOutputGeneratedError.isInstance(error)) {
        const cause = error.cause instanceof Error ? error.cause : null;
        const name = cause?.name ?? "Error";
        const message = cause?.message ?? "No structured output generated.";
        console.error(`[Climate Writer Agent] No structured output generated: ${name}: ${message}`);
      } else {
        const name = error instanceof Error ? error.name : "Error";
        const message = error instanceof Error ? error.message : String(error);
        const truncated = message.length > 200 ? message.slice(0, 200) + "..." : message;
        console.error(
          `[Climate Writer Agent] FAILED | Attempt: ${attempt} — ${name}: ${truncated}`,
        );
      }

      await runLog.record("error", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : typeof error,
      });

      if (attempt === MAX_AGENT_ATTEMPTS) {
        console.error("[Climate Writer Agent] All attempts exhausted.");

        await runLog.finish();

        throw error;
      }

      console.log("[Climate Writer Agent] Waiting 4 seconds before retry...");
      await sleep(RETRY_DELAY_MS);
    }
  }

  await runLog.finish();

  throw new Error("Climate Writer agent exhausted all attempts.");
}
