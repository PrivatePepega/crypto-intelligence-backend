import { generateText, isStepCount, streamText } from "ai";

import { setTimeout as sleep } from "node:timers/promises";

import { models } from "../../../AI/providers/model.js";

import { type ObserverConfig } from "../weather.config.js";

import { getAgenticContext, getAgenticTooling, estimateTokens } from "../../utils/general.tools.js";

import { getReasoningText, modelIdOf, normalizeStep } from "../../utils/agent.js";
import { withModelRetry } from "../../utils/weather/retry.js";

import { createObserverRunLog, persistObservations } from "../../utils/weather/observer.js";

import {
  parseObservations,
  type DailySet,
  type Observation,
} from "../../utils/weather/observations.js";

// --------------------------------------------------
// Observer
// --------------------------------------------------
const modelPick = models.openrouterFree;

const MAX_AGENT_STEPS = 5;

// How long this agent keeps retrying one model call before the domain is abandoned.
//
// Set to ride out a provider shortage, not to catch a single blip. OpenRouter
// capacity errors arrive as `503 Service temporarily overloaded` from a provider that
// is up and has no capacity for the moment, and they arrive in clusters lasting
// minutes rather than seconds. The earlier five-attempt budget gave up inside a
// minute and cost the whole domain, which is the failure this exists to prevent.
//
// The pair multiplies out: 48 attempts ten seconds apart is about eight minutes of
// waiting. Long enough for capacity to return inside a working session, short enough
// that a real outage still gets reported rather than hanging all night.
//
// Lower these to fail faster when running interactively. Raise them when a run that
// must finish is worth waiting out.
const RETRY_ATTEMPTS = 48;
const RETRY_DELAY_MS = 10_000;
/**
 * Pause between agent steps, in milliseconds.
 *
 * Each step is a model call plus its tool results, so a five-step run is five
 * back-to-back requests against the same provider and the same news APIs. The
 * pause keeps the run inside rate limits, which matters most on the free tiers
 * where a burst is what trips the limit.
 *
 * Same value as the Researcher's per-observation pause, so the whole pipeline
 * paces itself consistently.
 */
const STEP_DELAY_MS = 4_000;

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

const OBSERVER_FINDINGS_MARKER = "{{observerFindings}}";

/**
 * Runs the Observer and returns the observations it produced.
 *
 * Parsing the Formatter's JSON response happens here so callers receive ready to
 * store rows instead of raw text. The untouched response, and every phase that
 * produced it, is kept in the run log at AI/data/<agent>/<agent>-NNN.json.
 */
export const runObserver = async (
  intelligenceSet: DailySet,
  config: ObserverConfig,
): Promise<Observation[]> => {
  console.log(`[observe] Observation run initialized for domain: ${config.domain}`);

  const runLog = await createObserverRunLog(config.domain);

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

  // The whole call is retried rather than the individual steps: the step loop belongs
  // to the SDK, so a stream that has already started emitting cannot be resumed, and
  // a failure part-way through can only be recovered by making the call again.
  //
  // `streamText` is lazy - it returns before the request is made - so the retry has to
  // wrap the consumption of the stream, not its creation. Wrapping the creation would
  // return instantly, five times, without ever asking the provider anything.
  const callObserver = async () => {
    const stream = streamText({
      model: modelPick,

      instructions: observerSystemPrompt,

      prompt: observerDevPrompt,

      tools: getAgenticTooling(config),

      stopWhen: isStepCount(MAX_AGENT_STEPS),

      onStepEnd: async (step) => {
        await runLog.record("step", normalizeStep(step));

        // The SDK calls this per step and waits for it to resolve before starting
        // the next one, so awaiting here is what actually paces the run.
        //
        // Skipped when the step made no tool calls: the agent has stopped searching
        // and answered, so there is no next request to space out. The SDK also
        // cannot tell this callback whether the step was the last, which is why the
        // tool-call count is used instead of a step number.
        if (STEP_DELAY_MS > 0 && step.toolCalls.length > 0) {
          await sleep(STEP_DELAY_MS);
        }
      },
    });

    return {
      text: await stream.text,
      steps: await stream.steps,
      usage: await stream.usage,
    };
  };

  // A blank response is a failure, not an empty day. A provider under load can answer
  // successfully with nothing, and the run then injects zero rows and reports success -
  // which is exactly how a 503 became a clean-looking run with no observations.
  //
  // Steps recorded by an attempt that then failed stay in the run log. They are left
  // rather than rolled back because they are evidence of what the provider actually
  // did, and the retry lines say how many attempts there were.
  const observerRun = await withModelRetry(callObserver, `observer (${config.domain})`, {
    attempts: RETRY_ATTEMPTS,
    delayMs: RETRY_DELAY_MS,
    isEmptyResult: (result) => result.text.trim().length === 0,
  });

  const observerText = observerRun.text;

  const observerSteps = observerRun.steps;

  const observerUsage = observerRun.usage;

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
  // Observer findings
  // --------------------------------------------------

  /**
   * What the formatter is given instead of the raw tool evidence.
   *
   * The evidence block carried every tool call's arguments and every tool result,
   * serialized. On a busy domain that is tens of thousands of characters of news
   * snippets and API payloads, and the formatter degraded under it: one run emitted
   * the same observation four hundred times with `<unk>` in between. The input was
   * larger than the model's working context, so it stopped being able to hold it.
   *
   * What replaces it is what the Observer itself produced - its reasoning at each
   * step, and its final answer. That is roughly an order of magnitude smaller, and it
   * is already organised: the Observer did the reading, and the step where it paused
   * to consolidate is where the full inventory lives, before its final answer ranked
   * and collapsed it.
   *
   * Built from `observerSteps` rather than collected in `onStepEnd` so it cannot drift
   * from what the run log recorded for those same steps.
   */
  const observerFindings = [
    ...observerSteps.map((step) => ({
      step: step.stepNumber + 1,
      reasoning: getReasoningText(step),
    })),
    ...(observerText.trim().length > 0
      ? [{ step: observerSteps.length + 1, reasoning: observerText }]
      : []),
  ]
    .filter((entry) => entry.reasoning)
    .map(
      (entry) =>
        `<observer_step number="${entry.step}">
${entry.reasoning}
</observer_step>`,
    )
    .join("\n\n");

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

The Observer's findings, in the order it produced them:

<observer_findings>
${observerFindings}
</observer_findings>

The findings above are the Observer's own reasoning at each step followed by its final
answer. They are the complete inventory. Raw tool output is deliberately not included:
it is far larger than this task can reliably process, and the Observer already read
it.

YOUR ROLE: STRUCTURAL FORMATTING ONLY

You are a formatter, not a researcher, analyst, summarizer, or triage agent.

Your responsibility is to normalize the Observer's findings into the required JSON structure while preserving the complete inventory of distinct observations.

Triage is responsible for determining which observations deserve further research. You must not perform that job.

CORE RULES:

1. PRESERVE EVERY DISTINCT OBSERVATION
- Process the complete observation inventory supplied by the Observer.
- Every distinct observation must be represented in your output.
- Do not omit observations because they seem unimportant, insignificant, low-priority, uncertain, repetitive in theme, or unlikely to warrant research.
- Do not select only the most interesting, impactful, or relevant findings.
- Do not impose an observation count limit or arbitrarily shorten the inventory.
- The output should contain the same number of distinct observations as the input, except when genuine duplicates are consolidated.

2. DO NOT COMBINE DISTINCT OBSERVATIONS
- Keep independently meaningful events, developments, market conditions, anomalies, relationships, and narratives as separate observations.
- Observations concerning the same project, asset, institution, topic, or broader narrative are not necessarily duplicates.
- Do not combine several events into a thematic summary simply to make the output shorter.
- Do not turn multiple independent developments into one broad market narrative.
- Consolidate only genuine duplicates describing the same underlying signal.
- When consolidating genuine duplicates, preserve all unique factual details from the duplicated entries.

3. PRESERVE INFORMATION
- Retain meaningful facts, figures, percentages, absolute changes, dates, entities, source details, and relevant qualifiers provided in the findings.
- Do not remove useful information merely to make an observation shorter.
- You may correct wording, improve readability, normalize formatting, and remove genuinely redundant language.
- Do not reduce detailed observations to vague summaries.
- Do not introduce facts, calculations, causal relationships, or interpretations that are not supported by the supplied information.

4. PRESERVE UNCERTAINTY
- Maintain the original distinction between confirmed events, reported claims, hypotheses, suspicions, and unresolved questions.
- Do not turn allegations into established facts.
- Do not turn possible explanations into confirmed causal relationships.
- Do not remove caveats, limitations, or uncertainty that materially affect the meaning of an observation.

5. CLASSIFY WITHOUT RANKING
- Assign each observation the most appropriate type from the permitted types.
- Classification is a formatting task, not an assessment of importance.
- Do not assign importance scores, prioritize observations, determine research eligibility, or decide which findings should proceed downstream.
- Do not reject an observation because its type is ambiguous. Use "other" when no permitted type fits reliably.

6. USE THE FINDINGS AND CONTEXT CORRECTLY
- The Observer's findings are the inventory to preserve. Nothing outside them is an observation.
- The Observer's final answer is a condensed view of what it found. Where it condensed, the earlier step reasoning often holds the fuller form - use it to recover detail rather than treating the final answer as the limit of what was found.
- Foundational context describes deterministic market conditions. It may provide context but does not independently establish that an external event occurred.
- Do not perform additional research, investigate claims, or expand observations beyond the supplied material.
- Do not create new observations from foundational context that were not part of the Observer's findings.

7. VERIFY COMPLETENESS BEFORE RESPONDING
- Compare the output against the complete Observer inventory.
- Verify that every distinct input observation is represented.
- Verify that distinct observations have not been merged into broader summaries.
- Verify that meaningful details and uncertainty have been preserved.
- Genuine duplicate consolidation is the only permitted reason for reducing the number of output observations.
- Never silently return a partial inventory.
- If you cannot reliably process the complete inventory, do not fabricate or silently discard entries. Return a formatting failure through the mechanism supported by the caller.

OUTPUT CONTRACT:

Return ONLY valid JSON matching this structure:

{
  "observations": [
    {
      "observation": "string",
      "type": "market_condition | event | development | anomaly | relationship | narrative | regulation | other"
    }
  ]
}

Each array item must represent one distinct observation.

Do not include Markdown, code fences, commentary, explanations, importance scores, research decisions, or additional fields.

The output is a complete normalized inventory for downstream processing, not a curated selection of findings thats someones elses job.
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
      .replace(observerFindings, OBSERVER_FINDINGS_MARKER),

    embeddedValues: {
      [FOUNDATIONAL_CONTEXT_MARKER]: "observerContext, verbatim",

      [RESEARCH_NOTES_MARKER]: "the notes recorded in the research_notes entry",

      [OBSERVER_FINDINGS_MARKER]:
        "the Observer reasoning from each step, then its final answer; see the step " +
        "and observer_output sections",
    },
  });

  // --------------------------------------------------
  // Formatter
  // --------------------------------------------------

  // Retried, and a blank response counts as a failure. Without this the observer
  // parsed an empty string into zero observations and reported a clean run - the
  // exact shape the 503 produced.
  const formatterResult = await withModelRetry(
    () =>
      generateText({
        model: modelPick,

        instructions: formatterSystemPrompt,

        prompt: formatterDevPrompt,
      }),
    `observer formatter (${config.domain})`,
    {
      attempts: RETRY_ATTEMPTS,
      delayMs: RETRY_DELAY_MS,
      isEmptyResult: (run) => run.text.trim().length === 0,
    },
  );

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
    const observations = parseObservations(finalText);

    // Filed against the set here rather than by the caller, so one call runs the
    // Observer end to end and the pipeline cannot forget the write. The snapshot
    // comes back from the set rather than from `observations`, so what it records
    // is what actually committed.
    const { inserted, snapshotFile } = await persistObservations(
      intelligenceSet,
      config.domain,
      observations,
    );

    console.log(
      `[observe] Observation run finalized for domain: ${config.domain} - ` +
        `${observations.length} observation(s), ${inserted} row(s) written`,
    );

    if (snapshotFile) {
      console.log(`[observe] observations snapshot -> ${snapshotFile}`);
    }

    return observations;
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
