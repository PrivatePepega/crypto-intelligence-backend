import { generateText, isStepCount } from "ai";

import { models } from "../../providers/model.js";

import {
  answerGeneratorInputSchema,
  type AnswerGeneratorInput,
  type AnswerGeneratorOutput,
} from "../schemas/answerGenerator.schema.js";

import { buildAnswerGeneratorSystemPrompt } from "../prompts/answerGenerator.prompt.js";

import { getAgenticTooling } from "../../utils/general.tools.js";
import { createAgentRunLog } from "../../utils/logger.js";
import { modelIdOf, getReasoningText, normalizeStep, sleep } from "../../utils/agent.js";

// The logger turns this into AI/data/<agent name>/<run domain>-<n>.json.
const AGENT_NAME = "chatbot role Answer Generator";
const RUN_DOMAIN = "chat";
const MAX_AGENT_ATTEMPTS = 8;
const RETRY_DELAY_MS = 4_000;
const MAX_OUTPUT_TOKENS = 12_000;
const MAX_AGENT_STEPS = 4;

const modelPick = models.openrouterFree;

/**
 * Verification tools used when the caller does not pass `toolNames`.
 *
 * The answer generator already receives the researcher's evidence, so this is
 * deliberately narrower than the researcher's set: search, current news, and
 * the platform's stored climate, weather, and indicator data. The model is
 * told to use them only when the missing or uncertain evidence matters.
 */
const DEFAULT_ANSWER_TOOL_NAMES = [
  "webSearchTool",
  "currentsNewsSearch",
  "marketauxNewsSearch",
  "newsflashGetEvents",
  "newsMarketsNewsTool",
  "fetchClimateBrief",
  "fetchWeatherBrief",
  "fetchIndicatorData",
  "getCurrentIndicatorData",
] as const;

/**
 * Retry instructions, added to the user prompt after a failed attempt.
 *
 * Each one restates a requirement from the Answer Generator system prompt
 * rather than introducing a new task: answer the actual question, synthesize
 * rather than summarize, ground claims in evidence, verify only what matters,
 * stay concise and professional, and return one user-facing string.
 */
const RETRY_PROMPT_ADDITIONS: Record<number, string> = {
  2: `
RETRY — ANSWER THE USER'S ACTUAL QUESTION:
Re-read the User Query. Lead with the most important conclusion or finding that the evidence supports, and keep the answer within the requested scope, timeframe, and perspective.
Do not expand a narrow question into a broad market report or drift into unrelated topics.
Return only the user-facing answer as a single string.
`,
  3: `
RETRY — SYNTHESIZE THE EVIDENCE:
Combine the most relevant findings into a coherent explanation rather than listing or restating the Researcher Output.
Explain the relationships between findings, what the evidence indicates, and why it matters. Reconcile conflicting evidence where possible and disclose material disagreements that cannot be resolved.
Do not reproduce the research package or restate the Analyzer Query.
Return only the user-facing answer as a single string.
`,
  4: `
RETRY — GROUND THE ANSWER IN EVIDENCE:
Preserve relevant figures, units, timeframes, dates, and comparisons accurately. Include source links or citations when available and useful.
Do not invent facts, statistics, sources, quotations, market movements, or causal explanations. Distinguish established facts from interpretations, forecasts, and speculation, and do not confuse correlation with causation.
Where evidence is incomplete, state the limitation proportionately.
Return only the user-facing answer as a single string.
`,
  5: `
RETRY — VERIFY ONLY WHAT MATTERS:
Use the available tools only if essential evidence is missing, a material claim needs verification, or current conditions are required. Do not repeat research that the Researcher Output already covers.
Never claim to have retrieved or verified information unless you actually did. If important information remains unavailable, answer within the limits of the evidence.
Return only the user-facing answer as a single string.
`,
  6: `
RETRY — BE CONCISE AND CLEAR:
Aim for the shortest answer that adequately resolves the question. Remove repetition, unnecessary background, tangential facts, and filler. Use short paragraphs and structured lists only when they improve readability.
Use a formal, neutral, analytical tone. Avoid casual expressions, exaggerated claims, sensationalism, and unnecessary jargon.
Return only the user-facing answer as a single string.
`,
  7: `
RETRY — RETURN ONLY THE USER-FACING ANSWER:
Return a single string containing the complete answer. Do not return a JSON object, additional fields, internal reasoning, research logs, or commentary about the process.
Do not wrap the answer in quotation marks or Markdown code fences. Markdown headings, bullet points, and links are allowed inside the answer.
Return only the user-facing answer as a single string.
`,
  8: `
FINAL RETRY — LAST CHANCE:
This is your final attempt (8th total). Answer the user's original question directly and conservatively within the available evidence. Do not invent facts or expand the scope.
If the Analyzer Query is exactly "we only focus on financial markets here buddy", return that sentence as the answer. Otherwise, return a concise, professional, evidence-grounded response.
Return only the user-facing answer as a single string.
`,
};

/**
 * Removes provider reasoning artifacts and a single outer code fence from the
 * answer, without otherwise changing its Markdown.
 */
const cleanAnswer = (text: string): string => {
  let answer = text.trim();

  answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  answer = answer.replace(/^<\/think>\s*/i, "").trim();

  const fenced = answer.match(/^```[a-z]*\s*\n([\s\S]*?)\n```$/i);

  if (fenced?.[1]) {
    answer = fenced[1].trim();
  }

  return answer;
};

const isJsonWrapperText = (text: string): boolean => {
  const looksLikeObject = text.startsWith("{") && text.endsWith("}");
  const looksLikeArray = text.startsWith("[") && text.endsWith("]");

  if (!looksLikeObject && !looksLikeArray) {
    return false;
  }

  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

const MAX_PREVIOUS_ANSWER_PREVIEW_CHARS = 2_000;

/**
 * Builds the optional graph-level context appended to the user prompt.
 *
 * The Answer Generator's own retry loop handles malformed outputs. This context
 * handles a different case: the Answer Checker rejected an otherwise
 * well-formed answer as unusable, so the graph is asking for a fresh answer.
 */
function buildAnswerGeneratorContext(input: AnswerGeneratorInput): string {
  const sections: string[] = [];

  const answerExample = input.answerExample?.trim();
  if (answerExample) {
    sections.push(
      `ANSWER EXAMPLE (illustration of a satisfactory answer; not evidence):\n${answerExample}`,
    );
  }

  const isRetry = (input.retryAttempt ?? 1) > 1 || Boolean(input.retryFeedback?.trim());

  if (isRetry) {
    const attemptLine =
      input.retryAttempt && input.maxAttempts
        ? `This is answer attempt ${input.retryAttempt} of ${input.maxAttempts} after a previous answer failed the final quality check.`
        : "A previous answer failed the final quality check.";

    const previousAnswer = input.previousAnswer?.trim();
    const previousPreview =
      previousAnswer && previousAnswer.length > MAX_PREVIOUS_ANSWER_PREVIEW_CHARS
        ? `${previousAnswer.slice(0, MAX_PREVIOUS_ANSWER_PREVIEW_CHARS)}\n...[truncated]`
        : previousAnswer;

    sections.push(
      [
        "RETRY CONTEXT:",
        attemptLine,
        input.retryFeedback?.trim(),
        previousPreview
          ? `PREVIOUS ANSWER (rejected; do not repeat it if it has the same problem):\n${previousPreview}`
          : "",
        "Generate a fresh answer that directly addresses the user's original question and follows the required output format.",
      ]
        .filter((part): part is string => Boolean(part && part.length > 0))
        .join("\n\n"),
    );
  }

  return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
}

/**
 * Synthesizes the researcher's evidence into one user-facing answer.
 *
 * The first attempt starts as soon as the run log is opened; the four-second
 * wait only happens after a failed attempt.
 */
export async function runAnswerGeneratorAgent(
  input: AnswerGeneratorInput,
): Promise<AnswerGeneratorOutput> {
  const validatedInput = answerGeneratorInputSchema.parse(input);

  const systemPrompt = buildAnswerGeneratorSystemPrompt({
    climateBrief: validatedInput.climateBrief,
    climateBriefDate: validatedInput.climateBriefDate ?? "",
  });

  const currentDate = new Date().toISOString().slice(0, 10);
  const researcherOutput = validatedInput.researcherOutput.trim();
  const researcherOutputText =
    researcherOutput.length > 0 ? researcherOutput : "(no research output provided)";

  const originalUserPrompt = `CURRENT DATE:
${currentDate}

USER QUERY:
${validatedInput.userQuery}

ANALYZER QUERY:
${validatedInput.analyzerQuery}

RESEARCHER OUTPUT:
${researcherOutputText}${buildAnswerGeneratorContext(validatedInput)}`;

  const toolNames = validatedInput.toolNames ?? [...DEFAULT_ANSWER_TOOL_NAMES];
  const tools = getAgenticTooling({ tools: toolNames });

  // Logged before the first await so initialization is visible immediately.
  console.log("[Chatbot Answer Generator] INITIALIZED");

  const runLog = await createAgentRunLog(AGENT_NAME, RUN_DOMAIN);

  await runLog.record("initializer", {
    currentDate,
    climateBriefDate: validatedInput.climateBriefDate ?? null,
    userQuery: validatedInput.userQuery,
    analyzerQuery: validatedInput.analyzerQuery,
    researcherOutputChars: validatedInput.researcherOutput.length,
    answerExampleChars: validatedInput.answerExample?.length ?? 0,
    retryAttempt: validatedInput.retryAttempt ?? null,
    maxAttempts: validatedInput.maxAttempts ?? null,
    retryFeedback: validatedInput.retryFeedback ?? null,
    previousAnswerChars: validatedInput.previousAnswer?.length ?? 0,
    model: modelIdOf(modelPick),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxSteps: MAX_AGENT_STEPS,
    toolNames,
    systemPrompt,
  });

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt++) {
    const userPrompt =
      attempt === 1
        ? originalUserPrompt
        : `${originalUserPrompt}\n\n${RETRY_PROMPT_ADDITIONS[attempt]}`;

    try {
      console.log(`[Chatbot Answer Generator] ATTEMPT ${attempt}/${MAX_AGENT_ATTEMPTS}`);

      await runLog.record("prompt", {
        attempt,
        prompt: userPrompt,
      });

      const result = await generateText({
        model: modelPick,
        instructions: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0,

        tools,
        stopWhen: isStepCount(MAX_AGENT_STEPS),

        onStepEnd: async (step) => {
          await runLog.record("step", normalizeStep(step));
        },
      });

      const steps = await result.steps;

      const finalText =
        [...steps].reverse().find((step) => step.text.trim().length > 0)?.text ?? result.text;

      const answer = cleanAnswer(finalText);

      await runLog.record("output", {
        attempt,
        answer,
      });

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

      if (answer.length === 0) {
        throw new Error("Answer Generator returned an empty answer.");
      }

      if (isJsonWrapperText(answer)) {
        throw new Error(
          "Answer Generator returned a JSON object or array instead of a user-facing string.",
        );
      }

      if (finishReason === "length") {
        throw new Error("Answer Generator response was truncated (finish reason: length).");
      }

      console.log(`[Chatbot Answer Generator] SUCCESS | Attempt: ${attempt}`);

      await runLog.finish(answer);

      console.log("[Chatbot Answer Generator] FINALIZED");

      return answer;
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : String(error);
      const truncated = message.length > 200 ? message.slice(0, 200) + "..." : message;
      console.error(
        `[Chatbot Answer Generator] FAILED | Attempt: ${attempt} — ${name}: ${truncated}`,
      );

      await runLog.record("error", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : typeof error,
      });

      if (attempt === MAX_AGENT_ATTEMPTS) {
        console.error("[Chatbot Answer Generator] All attempts exhausted.");

        await runLog.finish();

        throw error;
      }

      console.log("[Chatbot Answer Generator] Waiting 4 seconds before retry...");
      await sleep(RETRY_DELAY_MS);
    }
  }

  await runLog.finish();

  throw new Error("Chatbot Answer Generator agent exhausted all attempts.");
}
