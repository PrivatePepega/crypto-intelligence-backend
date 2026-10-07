import { isStepCount, streamText } from "ai";

import { models } from "../../../AI/providers/model.js";

import { type ObserverConfig } from "./observer.config.js";

import { getAgenticContext, getAgenticTooling, estimateTokens } from "../../utils/general.tools.js";

import {
  logAgentStart,
  logAgentPrompt,
  logAgentResearchEvidence,
  logAgentResearchNotes,
  logAgentUsage,
  logAgentToolUsage,
  logAgentOutput,
  logAgentReasoning,
  logAgentStep,
  logAgentFormatterStart,
  createAgentRunLog,
  type AgentRunLog,
} from "../../utils/logger.js";

import { getReasoningText, normalizeStep } from "../../utils/agent.js";

// --------------------------------------------------
// Observer
// --------------------------------------------------

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

/** Instructions for the middle phase: compress the Observer phase into notes. */
const RESEARCH_NOTES_INSTRUCTIONS =
  "You are the Observer research-notes writer. Summarize the collected evidence for the final Formatter model. Do not perform additional research.";

/**
 * Runs the Observer, recording the run to a numbered log file.
 *
 * The console transcript is deliberately not captured. Every line the logger
 * prints is already recorded as a structured entry.
 */
export const runObserver = async (config: ObserverConfig) => {
  const runLog = await createAgentRunLog(AGENT_NAME);

  return runObserverLogged(config, runLog);
};

/**
 * The Observer run itself.
 *
 * Split out of {@link runObserver} so the run-log handle stays an explicit
 * dependency rather than something reached for from module scope.
 */
const runObserverLogged = async (config: ObserverConfig, runLog: AgentRunLog) => {
  const observerContext = await getAgenticContext(config);

  const initialContextTokens = estimateTokens(observerContext);

  logAgentStart(AGENT_NAME, initialContextTokens);

  // --------------------------------------------------
  // Observer prompts
  // --------------------------------------------------

  const observerSystemPrompt = `
  You are the Observer for a market intelligence platform.
  
  Your role is breadth and discovery.
  
  Pipeline:
  Observer = discovery and breadth
  Triage = prioritization
  Brief Analyst = compression and synthesis
  Lead = daily intelligence narrative
  
  Observe the configured market domain and discover meaningful things happening today that are worth passing to the next stage.
  
  You are NOT the researcher. Your job is to discover signals, developments, conditions, anomalies, and stories — not investigate, explain, or determine their importance.
  
  Start with the foundational deterministic market state below. Treat it as the actual measured state of the market, then use your tools as DISCOVERY TOOLS to broadly scan the configured domain and relevant subcategories.
  
  Think broadly. The configured domain is your primary focus, but markets are interconnected. Look outside it when another market, sector, country, macro condition, or geopolitical development is clearly relevant.
  
  You are looking for WHAT IS HAPPENING, not WHY.

  When using tools for broad research make sure to use a bit limit, so to optimize tool usage and not waste. limit 50 has the same cost as limit 10 it spends a ping.
  
  A headline or reported development can be a complete observation. If something is interesting, mention it and move on. Do not:
  - investigate or research the story deeply
  - search for causes or explanations
  - determine its final significance
  - repeatedly investigate the same event
  - turn an observation into a research task
  
  Those responsibilities belong to later stages.
  
  If you do not know why something happened, simply report what happened. Preserve uncertainty and never fill gaps with assumptions. Do not infer causation without evidence.
  
  Use broad discovery to find meaningful developments, but do not become locked onto individual stories. Stop searching when additional searches are unlikely to produce materially different observations.
  
  Each observation must be concise, at most 2 sentences, and represent something worth passing forward.
  
  Do not organize, rank, explain, or synthesize observations. Do not write the daily narrative or final conclusions.
  
  Do not create observations merely to increase the count, and do not report ordinary market conditions unless they are meaningfully unusual. If nothing significant is happening, it is acceptable to report that conditions are broadly normal.
  
  Distinguish between:
  - directly observed market conditions
  - reported developments
  - market narratives or claims
  - uncertain or unconfirmed information
  
  Never turn speculation into fact.
  
  Do not include URLs, citations, source names, Markdown, headings, numbered lists, or source references in observations. Supporting evidence is recorded separately.
  
  The goal is not a fixed number of observations. The goal is to discover the meaningful things happening today and give the next stage a broad, useful view of the market.
  
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

    initialContextTokens,

    initialContextTokenization:
      "Estimated with the local gpt-4o tokenizer; foundational context only.",

    instructionsCharacters: observerSystemPrompt.length,

    finalInstructionsCharacters: 0,

    contextCharacters: observerContext.length,

    context: JSON.parse(observerContext),
  });

  logAgentPrompt(AGENT_NAME, observerDevPrompt);

  await runLog.record("prompt", {
    prompt: observerDevPrompt,
  });

  // --------------------------------------------------
  // Observer
  // --------------------------------------------------

  const observerResult = streamText({
    model: models.openrouter,

    instructions: observerSystemPrompt,

    prompt: observerDevPrompt,

    tools: getAgenticTooling(config),

    stopWhen: isStepCount(MAX_AGENT_STEPS),

    onStepEnd: async (step) => {
      logAgentStep(AGENT_NAME, step);

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

  logAgentReasoning(AGENT_NAME, lastReasoningText);

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

  logAgentResearchEvidence(AGENT_NAME, observerEvidence);

  // --------------------------------------------------
  // Research Notes
  // --------------------------------------------------

  // Extracted so the prompt and the run log reference the same value, and so the
  // run log can strip it back out without re-serializing.
  const embeddedObserverEvidence = JSON.stringify(observerEvidence, null, 2);

  const researchNotesPrompt = `
Create concise research notes from the completed Observer research.

The research phase is complete and you have no tools available.

Use the raw tool evidence below as the factual basis.

Your notes should:

- summarize the meaningful developments discovered
- connect related evidence when supported
- distinguish confirmed events from speculation
- preserve important uncertainty
- mention important market context from the evidence
- avoid inventing facts or causes
- avoid deep research
- do not write the final daily intelligence narrative

Return concise plain-text research notes for the final Observer formatting.

<observer_evidence>
${embeddedObserverEvidence}
</observer_evidence>
`;

  const researchNotesResult = streamText({
    model: models.openrouter,

    instructions: RESEARCH_NOTES_INSTRUCTIONS,

    prompt: researchNotesPrompt,
  });

  const researchNotes = await researchNotesResult.text;

  const researchNotesUsage = await researchNotesResult.usage;

  // A model can legitimately return whitespace rather than notes. The formatter
  // still needs a value to interpolate, and an empty string would produce an
  // empty <research_notes> block that reads as "no evidence found".
  const normalizedResearchNotes = researchNotes.trim() || "No research notes were produced.";

  logAgentResearchNotes(AGENT_NAME, normalizedResearchNotes);

  await runLog.record("research_notes", {
    notes: normalizedResearchNotes,
  });

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

Research notes:
<research_notes>
${normalizedResearchNotes}
</research_notes>

Raw Observer evidence:
<observer_evidence>
${embeddedObserverEvidence}
</observer_evidence>

Your role is FORMATTING, not research or analysis.

Convert the supplied Observer findings into a clean, concise, consistent JSON object.

Use the research notes and raw evidence to preserve the Observer's actual findings. The raw evidence is authoritative when notes are incomplete.

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

  logAgentFormatterStart(AGENT_NAME, formatterDevPrompt);

  // No `researchNotes` field here: the notes are already recorded once in their
  // own entry above, so repeating them in the formatter entry duplicated ~3 KB
  // per run. The marker still stays in the prompt, because the rendered prompt
  // inlines the notes as text.
  await runLog.record("formatter", {
    prompt: formatterDevPrompt
      .replace(observerContext, FOUNDATIONAL_CONTEXT_MARKER)
      .replace(normalizedResearchNotes, RESEARCH_NOTES_MARKER)
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

  const formatterResult = streamText({
    model: models.openrouter,

    instructions: formatterSystemPrompt,

    prompt: formatterDevPrompt,
  });

  let finalText = "";

  for await (const textDelta of formatterResult.textStream) {
    finalText += textDelta;

    process.stdout.write(textDelta);
  }

  const formatterUsage = await formatterResult.usage;

  // --------------------------------------------------
  // Final diagnostics
  // --------------------------------------------------

  logAgentUsage({
    agentName: AGENT_NAME,

    initialContextTokens,

    researchUsage: observerUsage,

    researchNotesUsage,

    formatterUsage,

    researchSteps: observerSteps.length,
  });

  await runLog.record("usage", {
    initialContextTokens,

    observerUsage,

    researchNotesUsage,

    formatterUsage,

    observerSteps: observerSteps.length,

    totalRunTokens:
      (observerUsage.totalTokens ?? 0) +
      (researchNotesUsage.totalTokens ?? 0) +
      (formatterUsage.totalTokens ?? 0),
  });

  logAgentToolUsage(AGENT_NAME, observerSteps);

  logAgentOutput(AGENT_NAME, finalText);

  const runLogPath = await runLog.finish(finalText);

  runLog.note(`Run log written to ${runLogPath}`);

  return finalText;
};
