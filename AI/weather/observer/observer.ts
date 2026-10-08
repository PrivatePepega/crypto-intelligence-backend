import { generateText, isStepCount, streamText } from "ai";

import { models } from "../../../AI/providers/model.js";

import { type ObserverConfig } from "./observer.config.js";

import { getAgenticContext, getAgenticTooling, estimateTokens } from "../../utils/general.tools.js";

import { createAgentRunLog } from "../../utils/logger.js";

import { getReasoningText, modelIdOf, normalizeStep } from "../../utils/agent.js";
import { parseObservations, type Observation } from "../../utils/weather/observations.js";

// --------------------------------------------------
// Observer
// --------------------------------------------------
const modelPick = models.openrouter;

const MAX_AGENT_STEPS = 5;

/**
 * This agent's name.
 *
 * Used for every console heading, and for the run-log folder and file name, so
 * one value identifies the agent everywhere.
 */
const AGENT_NAME = "Weather Observer";

/**
 * Markers left in the stored formatter prompt where a large embedded value was
 * removed.
 *
 * The formatter prompt inlines the foundational context, the research notes and
 * the tool evidence as text. Storing that rendered prompt would put a second
 * copy of all three inside a string, where they read as JSON-shaped text rather
 * than JSON, and the evidence alone would be most of the entry. Each value is
 * recorded separately, so the stored prompt keeps these markers and the prompt
 * can be rebuilt by substituting the recorded values back in.
 */
const FOUNDATIONAL_CONTEXT_MARKER = "{{foundationalContext}}";

const RESEARCH_NOTES_MARKER = "{{researchNotes}}";

const OBSERVER_EVIDENCE_MARKER = "{{observerEvidence}}";

/** How the evidence is inlined, so the prompt can be rebuilt exactly. */
const OBSERVER_EVIDENCE_FORMAT = "JSON.stringify(observerEvidence, null, 2)";

/**
 * Runs the Observer and returns the observations it produced.
 *
 * Parsing the Formatter's JSON response happens here so callers receive ready to
 * store rows instead of raw text. The untouched response, and every phase that
 * produced it, is kept in the run log at AI/data/<agent>/<agent>-NNN.json.
 */
export const runObserver = async (config: ObserverConfig): Promise<Observation[]> => {
  const runLog = await createAgentRunLog(AGENT_NAME);

  const observerContext = await getAgenticContext(config);

  const initialContextTokens = estimateTokens(observerContext);

  // --------------------------------------------------
  // Observer prompts
  // --------------------------------------------------

  const observerSystemPrompt = `
  You are the Observer in a market intelligence pipeline.
  
  Pipeline:
  Observer = broad signal discovery
  Formatter = structured output
  Research = investigation and evidence
  Lead = synthesis and analysis
  
  Your sole job is to find signals from the noise.
  
  You are a discovery agent, not a researcher or analyst. Your job is to scan a broad surface area and report every distinct, meaningful signal supported by the available data. Do not deeply investigate stories, explain causes, determine final significance, or build conclusions. Those tasks belong to downstream agents.
  
  1. DETERMINISTIC MARKET STATE
  
  Start by analyzing the foundational deterministic market data provided below.
  
  Look for meaningful and drastic changes, anomalies, unusual conditions, accelerations, reversals, and other notable movements.
  
  Consider both percentage change and absolute magnitude. A $1B movement and a 0.1% movement are not equivalent.
  
  Prioritize changes that are:
  - large
  - unusual
  - rapidly changing
  - reversing a previous trend
  - historically or contextually notable
  - potentially important across markets or categories
  
  Do not search for information that is already present in the deterministic data. If the data shows a major unexplained movement, a search may be used to discover reporting about that movement.
  
  2. REQUIRED NEWS DISCOVERY
  
  Call cvBreakingTool for broad discovery of the latest important and breaking developments.
  
  Call cvTrendingTool for broad discovery of stories currently receiving significant attention.
  
  These are discovery passes. Do not deeply investigate individual stories.
  
  3. BROAD WEB DISCOVERY
  
  Use web search to discover important, breaking, and trending developments across the configured domain and its relevant categories.
  
  The goal is broad surface-area discovery, not investigation of one specific story.
  
  Prefer broad queries such as:
  
  "What are the important news developments in crypto today?"
  
  "What are the most important breaking news in financial markets today?"
  
  "What major developments are trending in geopolitics today?"
  
  "What are the important AI news developments today?"
  
  "What major macro and monetary developments are happening today?"
  
  Avoid narrow queries such as:
  
  "Why did Bitcoin ETFs have outflows on October 8 2026?"
  
  unless a major deterministic movement specifically requires additional discovery.
  
  When using web search, request the maximum useful result limit supported by the tool so the discovery pass has broad coverage and resources are used efficiently.
  
  Prioritize high-signal reporting, important developments, breaking events, and emerging stories over generic, repetitive, or low-value content.
  
  4. BROAD DISCOVERY
  
  The Observer should deliberately cover a broad surface area of the configured domain.
  
  Look across relevant categories such as:
  - markets
  - macro
  - monetary policy
  - regulation
  - geopolitics
  - politics
  - commodities
  - technology
  - security
  - institutions
  - companies
  - protocols
  - infrastructure
  - other domain-specific developments
  
  Do not assume every category will contain a signal every day. Discover what is actually happening.
  
  After the required discovery passes, additional tools may be used when they are likely to reveal materially different signals.
  
  Do not repeatedly search the same story.
  Do not create a research process.
  Do not keep searching merely because another tool is available.
  
  5. OBSERVATIONS
  
  Report EVERY distinct meaningful signal discovered.
  
  Do not artificially limit the number of observations.
  
  If there are 5 meaningful observations, report 5.
  If there are 50 meaningful observations, report 50.
  
  Concise applies to each observation, not to the total number of observations.
  
  Duplicates discovered across different sources should be merged into one observation rather than reported repeatedly.
  
  A headline or reported development can be a complete observation.
  
  You do NOT need to research or verify every headline before reporting it. Downstream research agents will investigate important observations later.
  
  A reported event can therefore be recorded as:
  - a major company announcement
  - a regulatory action
  - a geopolitical development
  - a market event
  - an institutional move
  - a protocol or technology development
  - a security incident
  - a notable narrative or claim
  - another meaningful development
  
  Distinguish between:
  - directly observed market conditions
  - reported developments
  - narratives or claims
  - uncertain or unconfirmed information
  
  Never present speculation as established fact.
  Never invent information.
  Do not infer causation without evidence.
  
  Do not report ordinary conditions unless they are meaningfully unusual.
  
  Do not rank the observations.
  Do not synthesize them into a daily narrative.
  Do not explain why they matter.
  Do not perform deep research.
  
  Your output should be a broad inventory of meaningful signals for downstream agents to investigate and analyze.
  
  Your goal:
  
  DISCOVER BROADLY.
  FIND SIGNALS FROM THE NOISE.
  ANALYZE THE DETERMINISTIC STATE.
  SEARCH THE BROAD NEWS SURFACE.
  REPORT EVERY MEANINGFUL SIGNAL.
  MERGE DUPLICATES.
  DO NOT OVER-INVESTIGATE.
  DO NOT INVENT.
  
  Foundational deterministic market state:
  
  ${observerContext}
  `;

  const observerDevPrompt = `
Observe the ${config.domain} domain for today.

Objective:
${config.objective}

Areas of observation:
${config.categories.map((category) => `- ${category}`).join("\n")}

Identify meaningful developments and produce observations.
`;

  // --------------------------------------------------
  // Prompt diagnostics
  // --------------------------------------------------

  await runLog.record("initializer", {
    domain: config.domain,

    objective: config.objective,

    categories: config.categories,

    configuredTools: config.tools,

    maxSteps: MAX_AGENT_STEPS,

    // Which model actually served the run. Provider defaults and routers change
    // what answers, and without this a run log cannot say. Read defensively:
    // `modelId` lives on the concrete model type, not the LanguageModel alias.
    model: modelIdOf(modelPick),

    initialContextTokens,

    initialContextTokenization:
      "Estimated with the local gpt-4o tokenizer; foundational context only.",

    instructionsCharacters: observerSystemPrompt.length,

    finalInstructionsCharacters: 0,

    contextCharacters: observerContext.length,

    context: JSON.parse(observerContext),
  });

  await runLog.record("prompt", {
    prompt: observerDevPrompt,
  });

  // --------------------------------------------------
  // Observer
  // --------------------------------------------------

  const observerResult = streamText({
    model: modelPick,

    instructions: observerSystemPrompt,

    prompt: observerDevPrompt,

    tools: getAgenticTooling(config),

    stopWhen: isStepCount(MAX_AGENT_STEPS),

    onStepEnd: async (step) => {
      await runLog.record("step", normalizeStep(step));
    },
  });

  const observerText = await observerResult.text;

  const observerSteps = await observerResult.steps;

  const observerUsage = await observerResult.usage;

  // The formatter consumes the research notes rather than this raw text, so the
  // notes are the compression of it. Recorded here because it is the Observer's
  // own account of what it saw, which is worth reviewing against the notes when
  // a run looks wrong.
  await runLog.record("observer_output", {
    text: observerText,
  });

  // --------------------------------------------------
  // Final observable reasoning
  // --------------------------------------------------

  let lastReasoningText: string | null = null;

  for (const step of observerSteps) {
    const reasoningText = getReasoningText(step);

    if (reasoningText) {
      lastReasoningText = reasoningText;
    }
  }

  await runLog.record("reasoning", lastReasoningText);

  // --------------------------------------------------
  // Observer evidence
  // --------------------------------------------------

  const observerEvidence = observerSteps
    .filter(
      (step) => step.toolCalls.length > 0 || step.toolResults.length > 0 || Boolean(step.text),
    )
    .map((step) => ({
      step: step.stepNumber + 1,

      text: step.text || null,

      toolCalls: step.toolCalls.map((toolCall) => ({
        tool: toolCall.toolName,
        arguments: toolCall.input,
      })),

      toolResults: step.toolResults.map((toolResult) => ({
        tool: toolResult.toolName,
        result: toolResult.output,
      })),
    }));

  // --------------------------------------------------
  // Research Notes
  // --------------------------------------------------

  // Extracted so the prompt and the run log reference the same value, and so the
  // run log can strip it back out without re-serializing.
  const embeddedObserverEvidence = JSON.stringify(observerEvidence, null, 2);

  // --------------------------------------------------
  // Formatter prompts
  // --------------------------------------------------

  const formatterSystemPrompt = `

`;

  const formatterDevPrompt = `
Format the Observer's findings into the required JSON structure.

Configured domain:
${config.domain}

Observer objective:
${config.objective}

Areas observed:
${config.categories.join(", ")}

Foundational market context:
<foundational_context>
${observerContext}
</foundational_context>



Raw Observer evidence:
<observer_evidence>
${embeddedObserverEvidence}
</observer_evidence>

Your role is FORMATTING, not research or analysis.

Convert the supplied Observer findings into a clean, concise, consistent JSON object.

The raw evidence is authoritative when notes are incomplete.

Do not:
- perform additional research
- investigate or expand observations
- determine importance
- add explanations or implications
- invent facts or causal relationships
- turn uncertainty into certainty
- create observations that are not supported by the supplied information

The foundational context describes the current deterministic market state and may provide context for observations, but it does not by itself prove that an external event occurred.

Preserve the meaning and uncertainty of the original observations. Remove duplication, obvious noise, and unnecessary wording.

Each observation must be concise and represent a meaningful finding worth passing to the next stage.

Return ONLY valid JSON matching this structure:

{
  "observations": [
    {
      "observation": "string",
      "type": "market_condition | event | development | anomaly | relationship | narrative | regulation | other"
    }
  ]
}

Do not include Markdown, code fences, commentary, explanations, or additional fields.
`;

  // --------------------------------------------------
  // Formatter diagnostics
  // --------------------------------------------------

  // No `researchNotes` field here: the notes are already recorded once in their
  // own entry above, so repeating them in the formatter entry duplicated ~3 KB
  // per run. The marker still stays in the prompt, because the rendered prompt
  // inlines the notes as text.
  await runLog.record("formatter", {
    prompt: formatterDevPrompt
      .replace(observerContext, FOUNDATIONAL_CONTEXT_MARKER)
      .replace(embeddedObserverEvidence, OBSERVER_EVIDENCE_MARKER),

    embeddedValues: {
      [FOUNDATIONAL_CONTEXT_MARKER]: "observerContext, verbatim",

      [RESEARCH_NOTES_MARKER]: "the notes recorded in the research_notes entry",

      [OBSERVER_EVIDENCE_MARKER]: `${OBSERVER_EVIDENCE_FORMAT} over the Observer tool evidence`,
    },
  });

  // --------------------------------------------------
  // Formatter
  // --------------------------------------------------

  const formatterResult = await generateText({
    model: modelPick,

    instructions: formatterSystemPrompt,

    prompt: formatterDevPrompt,
  });

  const finalText = formatterResult.text;

  const formatterUsage = formatterResult.usage;

  // Why generation stopped. A response cut off mid-JSON looks identical to a
  // complete one unless this is recorded: 'length' means a token ceiling,
  // 'content-filter' means the provider blocked it, 'stop' means the model
  // simply finished.
  const formatterFinishReason = formatterResult.finishReason;

  // --------------------------------------------------
  // Final diagnostics
  // --------------------------------------------------

  // The Observer's `usage` is the sum across every research step, so its input
  // count is the running total, not the context of any one step. Renamed so it
  // cannot be misread as the per-step figure recorded on each `step` entry.
  const { inputTokens: cumulativeInputTokens, ...observerUsageRest } = observerUsage;

  await runLog.record("usage", {
    initialContextTokens,

    observerUsage: {
      cumulativeInputTokens,
      ...observerUsageRest,
    },

    // researchNotesUsage,

    // The formatter is a single call, so its `inputTokens` is that one call's
    // context, not a total. Left under the plain name, matching the step entries.
    formatterUsage,

    formatterFinishReason,

    observerSteps: observerSteps.length,

    totalRunTokens:
      (observerUsage.totalTokens ?? 0) +
      // (researchNotesUsage.totalTokens ?? 0) +
      (formatterUsage.totalTokens ?? 0),
  });

  // finish() first, so the raw response is on disk before anything can throw.
  await runLog.finish(finalText);

  try {
    return parseObservations(finalText);
  } catch (error) {
    // The run log is the only place this survives once the process exits, so
    // record why the response was unusable instead of leaving just an exception.
    // finishReason is included because the text alone cannot distinguish a
    // truncated response from a complete one.
    await runLog.record("formatter_failure", {
      error: error instanceof Error ? error.message : String(error),
      characters: finalText.length,
      finishReason: formatterFinishReason,
      text: finalText,
    });

    throw error;
  }
};
