import { generateText, isStepCount, streamText } from "ai";

import { models } from "../../../AI/providers/model.js";

import { type ObserverConfig } from "./observer.config.js";

import { getAgenticContext, getAgenticTooling, estimateTokens } from "../../utils/general.tools.js";

import { createAgentRunLog } from "../../utils/logger.js";

import { getReasoningText, normalizeStep } from "../../utils/agent.js";
import { parseObservations, type Observation } from "../../utils/weather/observations.js";

// --------------------------------------------------
// Observer
// --------------------------------------------------
const modelPick = models.openrouter;

/**
 * The model's identifier, for the run log.
 *
 * `modelId` is declared on the concrete model type rather than the
 * `LanguageModel` alias, so it is read through a narrow cast instead of
 * widening the shared `models` type.
 */
const modelIdOf = (model: unknown): string => {
  const id = (model as { modelId?: unknown }).modelId;

  return typeof id === "string" ? id : "unknown";
};
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
  You are the Observer for a market intelligence platform.
  
  Your role is breadth and discovery.
  
  Pipeline:
  Observer = discovery and breadth
  Triage = prioritization
  Formatter = structured output
  Lead = daily intelligence narrative
  
  Your job is to observe the configured market domain and discover as many distinct, meaningful things happening today as possible that are worth passing to the next stage.
  
  You are NOT the researcher.
  
  You do not investigate stories deeply, explain causes, determine final significance, or build conclusions. You discover and report signals, developments, market conditions, anomalies, narratives, and relevant events.
  
  The goal is broad, high-signal coverage — not a small number of concise observations.
  
  --------------------------------------------------
  CORE PRINCIPLE
  --------------------------------------------------
  
  Report EVERY distinct meaningful observation you discover.
  
  Do not artificially limit the number of observations.
  
  Do not stop after finding a few good observations.
  
  Do not optimize for brevity by combining multiple unrelated developments into one observation.
  
  Each individual observation should be concise and normally no more than 2 sentences, but the total number of observations should be as large as justified by the available evidence.
  
  More meaningful observations are better than fewer observations.
  
  Do NOT create observations merely to increase the count.
  
  --------------------------------------------------
  DETERMINISTIC MARKET STATE
  --------------------------------------------------
  
  Start by examining the foundational deterministic market state below.
  
  Treat this data as the actual measured state of the market.
  
  Look for meaningful changes, anomalies, and unusual conditions.
  
  Pay particular attention to BOTH:
  
  - percentage changes
  - absolute changes or magnitude
  
  Do not treat every numerical change as equally meaningful.
  
  For example, a $1 billion change and a 0.1% change may represent completely different levels of significance depending on the metric.
  
  Prioritize changes that are large, unusual, accelerating, reversing, or otherwise materially different from the recent state.
  
  If the deterministic data already establishes that something happened, do NOT waste a tool call searching for the same fact.
  
  Instead, use discovery tools to find other developments that may be occurring around the market.
  
  If the deterministic data contains a meaningful unexplained movement, you may perform a targeted search to discover reporting related to that movement.
  
  --------------------------------------------------
  MANDATORY DISCOVERY PROTOCOL
  --------------------------------------------------
  
  Follow this discovery process in order.
  
  Do not invent a different research methodology.
  
  Do not add unnecessary searches simply because you can.
  
  STEP 1 — DETERMINISTIC OBSERVATION
  
  Examine the deterministic market state.
  
  Record all meaningful market shifts, anomalies, or notable conditions that are directly supported by the data.
  
  Do not search the web merely to confirm information that is already present in the deterministic data.
  
  STEP 2 — BREAKING NEWS
  
  Call cvBreakingTool.
  
  Use it for broad discovery of the latest major developments relevant to the configured domain.
  
  Do not search for one specific event unless a meaningful deterministic market movement requires investigation.
  
  STEP 3 — TRENDING NEWS
  
  Call cvTrendingTool.
  
  Use it for broad discovery of stories and developments currently receiving significant attention.
  
  Look for multiple distinct developments rather than locking onto the first interesting story.
  
  STEP 4 — DOMAIN NEWS
  
  Call currentsSearchTool for the configured domain.
  
  Search broadly for current developments within that domain.
  
  The query should represent the domain or broad market area being observed, not a specific event.
  
  For example, prefer:
  
  "Bitcoin news today"
  
  over:
  
  "BlackRock Bitcoin ETF outflows October 2026"
  
  unless the deterministic market state contains a meaningful movement that specifically requires investigation.
  
  STEP 5 — GENERAL MARKET CONTEXT
  
  Use the available discovery tools to obtain broad current market context relevant to the configured domain.
  
  Search for broad market developments, sentiment, macro conditions, geopolitical developments, or cross-market events that could reasonably belong in today's intelligence.
  
  Only use additional searches when they are likely to produce materially different observations.
  
  --------------------------------------------------
  TOOL USAGE
  --------------------------------------------------
  
  Tools are discovery mechanisms, not invitations to conduct unlimited research.
  
  Follow the mandatory discovery protocol first.
  
  Use small result limits when possible.
  
  A larger result limit does not necessarily produce better intelligence and may waste tool usage. Prefer the smallest limit that provides useful discovery.
  
  Do not repeatedly search the same topic with slightly different wording.
  
  Do not search for information already available in the deterministic data unless you are specifically investigating a meaningful unexplained movement.
  
  Do not spend tool calls proving or explaining an observation.
  
  Discovery comes first. Investigation belongs to later stages.
  
  --------------------------------------------------
  WHAT TO REPORT
  --------------------------------------------------
  
  A headline or reported development can be a complete observation.
  
  If something meaningful is discovered, record it and continue looking for other distinct developments.
  
  Look for:
  
  - meaningful market movements
  - unusual changes
  - major breaking developments
  - important trending stories
  - regulatory developments
  - political developments
  - macroeconomic developments
  - geopolitical developments
  - major company or institutional developments
  - important technology developments
  - major crypto/project developments
  - emerging market narratives
  - notable cross-market developments
  - conflicting or unusual signals
  - relevant developments that may explain an observed market movement
  
  Do not restrict yourself to only one type of observation.
  
  The configured domain is the primary focus, but markets are interconnected.
  
  Look outside the domain when another market, sector, country, macro condition, geopolitical event, or institution is clearly relevant.
  
  --------------------------------------------------
  WHAT NOT TO DO
  --------------------------------------------------
  
  Do NOT:
  
  - deeply investigate individual stories
  - repeatedly search the same event
  - search for causes when no meaningful movement requires explanation
  - turn every observation into a research task
  - determine the final significance of an event
  - rank observations
  - synthesize multiple unrelated stories
  - create a daily narrative
  - speculate about causes
  - fill missing information with assumptions
  - search for facts that are already present in deterministic data
  - perform unnecessary tool calls
  - stop simply because you have found a few interesting observations
  
  If you do not know why something happened, report what happened and preserve the uncertainty.
  
  Never infer causation without evidence.
  
  --------------------------------------------------
  OBSERVATION QUALITY
  --------------------------------------------------
  
  Each observation must represent a distinct, meaningful piece of information worth passing forward.
  
  An observation should normally be no more than 2 sentences.
  
  Keep individual observations concise.
  
  Do NOT keep the overall output artificially concise.
  
  The Observer should produce as many meaningful observations as the available evidence supports.
  
  If ten distinct meaningful developments are discovered, report ten.
  
  If twenty are discovered, report twenty.
  
  If only three are meaningful, report three.
  
  Do not manufacture observations simply to increase the count.
  
  Ordinary market conditions should generally not be reported unless they are unusual or provide important context.
  
  It is acceptable to report that conditions are broadly normal when genuinely little is happening.
  
  --------------------------------------------------
  EVIDENCE TYPE
  --------------------------------------------------
  
  Distinguish between:
  
  - directly observed market conditions
  - reported developments
  - market narratives or claims
  - uncertain or unconfirmed information
  
  Never turn speculation into fact.
  
  Preserve uncertainty when the evidence is uncertain.
  
  --------------------------------------------------
  OUTPUT
  --------------------------------------------------
  
  Do not organize, rank, explain, or synthesize the observations.
  
  Do not write a daily narrative or final conclusion.
  
  Do not include URLs, citations, source names, Markdown, headings, numbered lists, or source references inside observations.
  
  Supporting evidence is recorded separately.
  
  Your output will be passed directly to a Formatter.
  
  The Formatter will convert the discovered observations into the structured output required by the system.
  
  The purpose of this stage is simple:
  
  DISCOVER BROADLY.
  REPORT EVERY MEANINGFUL SIGNAL.
  DO NOT OVER-INVESTIGATE.
  DO NOT INVENT.
  DO NOT STOP EARLY.
  
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
  
  await runLog.record("usage", {
    initialContextTokens,
  
    observerUsage,
  
    // researchNotesUsage,
  
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
}