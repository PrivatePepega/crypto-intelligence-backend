/**
 * Brief Analyst: turns a domain's researched observations into a daily brief.
 *
 * The single entry point for three agents, run as one process:
 *
 * | phase | agent | does |
 * |---|---|---|
 * | one | the analyst | reads the day's research and observations, uses tools to fill gaps, returns JSON as text |
 * | two | the human brief | rewrites that output as a readable publication |
 * | three | the AI context brief | preserves the same day densely, for another agent to reason over |
 *
 * Phases two and three take the analyst's output **in memory**. Nothing is read
 * back off disk between them: the run log records what the run produced, it is not
 * an input to it. Reading it back would make a diagnostic artifact a production
 * dependency and would mean paying for the analyst twice.
 *
 * The analyst needs tools, and the provider refuses tool calling combined with JSON
 * mode, so the call that analyses cannot also be schema-constrained. It returns JSON
 * as text. Neither brief is schema-constrained either - each prompt sets its own
 * shape - and they are generated independently, so one failing does not discard the
 * other.
 *
 * All three phases are recorded into one run log at
 * `AI/data/Weather Brief Analyst/Weather Brief Analyst-NNN.json`, so the briefs can
 * be read beside the reasoning and tool calls that produced them.
 *
 * Nothing is written to the database yet. The run log is currently the only output,
 * which is deliberate - these runs exist to see what the model produces before a
 * table is built around it.
 *
 * This module has no entry point of its own. Call `runBriefAnalyst` from the
 * pipeline, which supplies the intelligence set and the domain.
 */

import { generateText, isStepCount } from "ai";

import { setTimeout as sleep } from "node:timers/promises";

import { models } from "../../providers/model.js";

import { type ObserverConfig } from "../weather.config.js";

import { getReasoningText, modelIdOf, normalizeStep } from "../../utils/agent.js";
import {
  estimateTokens,
  getAgenticContext,
  getAgenticTooling,
  getFullAgenticContext,
} from "../../utils/general.tools.js";
import { fetchResearchForSet } from "../../utils/weather/dbFetcher.researcher.js";
import { parseStoredResearch } from "../../utils/weather/researcher.js";
import { fetchObservationsForSet } from "../../utils/weather/dbFetcher.triage.js";
import {
  type BriefGenerationResult,
  type BriefSliders,
  createBriefAnalystRunLog,
  logFormatterError,
  parseAnalystBrief,
} from "../../utils/weather/briefAnalyst.js";
import { type DailySet } from "../../utils/weather/observations.js";

// The two briefs, generated from the analyst's output in this same run. Each file
// holds only its own prompts; the generation they share is `generateBrief`.
import { runAiContextBriefPhase } from "./aiContextBrief.js";
import { runHumanBriefPhase } from "./humanBrief.js";

/**
 * How much indicator data the analyst is given.
 *
 * - `"all"`: every series in the current dataset. Measured at 105 entries and
 *   roughly 78k tokens, sent on every analyst call.
 * - `"domain"`: only the domain's own `foundationalData`, a few thousand tokens.
 *
 * `"domain"` is the default because the analyst's own instructions describe the
 * dataset as "selected for your domain" and "domain-specific" throughout.
 * Supplying the whole dataset contradicts that wording, and the analyst prompt now
 * labels the section to match.
 *
 * Switch to `"all"` when testing whether a cross-domain reading is being missed -
 * at roughly double the context per call, and with indicators the prompt tells the
 * analyst to treat as out of scope.
 */
const INDICATOR_SCOPE: "all" | "domain" = "domain";

/**
 * The indicator context for a scope.
 *
 * The scope arrives as a parameter rather than being read from the slider here,
 * because a `const` with a literal type is narrowed by control-flow analysis and
 * the checker then reports the other branch as unreachable. Editing the slider is
 * the point of it, so both branches have to stay live.
 */
const indicatorContextFor = async (
  scope: "all" | "domain",
  config: ObserverConfig,
): Promise<string> =>
  scope === "all" ? await getFullAgenticContext(config) : await getAgenticContext(config);

/**
 * Pause between phases, in milliseconds. `0` disables it.
 *
 * Shared by all three agents, so it is stated once rather than per brief. Every
 * phase is a separate request to the same provider, and the pause keeps them from
 * landing back to back - the analyst's last one before each brief, and between the
 * two briefs. Same value as the other agents in the pipeline.
 */
const STEP_DELAY_MS = 4_000;

const ANALYST_TOOLS = [
  // "webSearchTool",
  // "currentsNewsSearch",
  // "newsflashSearchArticles",
  // "marketauxNewsSearch",
] as const;
const modelPick = models.openrouter;
const MAX_AGENT_STEPS = 3;
const MAX_ANALYST_OUTPUT_TOKENS = 80_000;
const REASONING_EFFORT = "medium" as const;

const HUMAN_BRIEF_MODEL = models.openrouterFree;
const HUMAN_BRIEF_MAX_STEPS = 3;
const HUMAN_MAX__OUTPUT_TOKENS = undefined;

const AI_BRIEF_MODEL = models.openrouterFree;
const AI_BRIEF_MAX_STEPS = 3;
const AI_MAX_OUTPUT_TOKENS = undefined;

//   Off, and leave it off. Reasoning effort is provider-specific - the SDK has no
//   cross-provider option, only `providerOptions` keyed by provider name - so the
//   slider takes both together. Sending Groq's setting to Google is not a harmless
//   no-op: it was previously sent as `{ groq: { reasoningEffort } }` to a non-Groq
//   provider and the model then returned a `reasoning` block and zero text.

/** The human brief's knobs, as `generateBrief` takes them. */
const HUMAN_BRIEF_SLIDERS: BriefSliders = {
  model: HUMAN_BRIEF_MODEL,
  maxSteps: HUMAN_BRIEF_MAX_STEPS,
  maxOutputTokens: HUMAN_MAX__OUTPUT_TOKENS,
  reasoningEffort: undefined,
};

// ---- AI Context Brief -------------------------------------------------
//
// Phase three: preserves the same day densely, for another agent to reason over.
// Same four knobs as the human brief, and independently set - changing one here
// leaves the human brief alone.

//   Every note above applies unchanged. The only thing that differs between the two
//   briefs is the prompt; see `aiContextBrief.ts`.

/** The AI context brief's knobs, as `generateBrief` takes them. */
const AI_CONTEXT_BRIEF_SLIDERS: BriefSliders = {
  model: AI_BRIEF_MODEL,
  maxSteps: AI_BRIEF_MAX_STEPS,
  maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
  reasoningEffort: undefined,
};

// --------------------------------------------------
// Prompts
// --------------------------------------------------

/** The analyst's role and standards. Fixed across every domain. */

const analystSystemPrompt = `
# Domain Brief Analyst

## Role

You are the Brief Analyst in a multi-stage intelligence pipeline.

Observer discovers and records signals. Triage selects observations for research. Research investigates selected observations. You synthesize the available observations, completed research, and deterministic indicators into a domain-specific daily brief. Formatter structures your output, and Lead combines domain briefs into the overall intelligence picture.

You are a synthesis and analysis agent, not a researcher. Do not use external tools, search for new evidence, or reinvestigate completed research.

## Objective

Produce a concise, evidence-grounded account of the intelligence period that explains:
- What the available data shows.
- What meaningful events and developments were recorded.
- Why important findings matter.
- How indicators, observations, and research relate.
- What the evidence suggests about current conditions and possible future implications.
- What remains uncertain or contradictory.

Prioritize understanding and significance over report length. Summarize the evidence rather than reproducing the input.

## 1. Indicator analysis

Review all supplied indicators, but give the most attention to movements and conditions that materially improve understanding of the day.

For meaningful indicators:
- Preserve the name, value, unit, direction, comparison period, and timestamp when available.
- Explain the significance of the current level or movement.
- Identify meaningful trends, corrections, rallies, sudden changes, divergences, or unusual readings when supported by the data.
- Connect indicators to relevant observations or research when a defensible relationship exists.

Distinguish new movements from unchanged levels, longer-term trends, and stale readings. Do not invent calculations, comparisons, or causal explanations. Not every latest reading represents a meaningful change.

## 2. Observation summaries

Read every supplied observation, including those not selected for research.

Represent every distinct observation in the brief, either individually or in a justified cluster of closely related observations. Preserve its identifier and essential meaning.

Explain what was recorded and why it matters when the available evidence supports an interpretation. Connect relevant research or indicators where appropriate.

An observation is a recorded signal, not necessarily a verified fact. Do not imply that an unresearched claim has been independently confirmed. Do not omit an observation solely because it lacks research.

## 3. Research summaries

Represent every distinct supplied research record in the brief. Preserve its identifier and summarize its main findings, essential evidence, significance, and relevant implications.

Use approximately 1–4 sentences per record, as needed. Do not copy entire reports or reduce meaningful findings to vague headlines.

Preserve material source information, conflicting evidence, uncertainty, and verification limitations. Merge genuinely duplicated findings only when their distinct conclusions and evidence remain traceable.

## 4. Cross-signal synthesis

Identify the most meaningful relationships between indicators, observations, and research.

Explain whether the evidence reinforces, contradicts, contextualizes, or plausibly explains another signal. Consider timing, relevant entities, market behavior, and potential mechanisms.

Distinguish:
1. **Evidence:** What the supplied records directly establish.
2. **Interpretation:** What the combined evidence reasonably suggests.
3. **Implication:** What could happen if a supported condition or hypothesis holds.

Temporal coincidence does not establish causation. Do not force relationships or invent a single narrative when the developments are unrelated.

Avoid repeating entire summaries. The purpose of synthesis is to add meaning that individual records cannot provide alone.

## 5. Overall assessment and implications

Summarize the day's most consequential developments, indicator conditions, and relationships. Explain what the combined evidence suggests about the assigned domain and identify the most important unresolved tension.

Assess sentiment or direction using an appropriate classification, such as bullish, bearish, mixed, neutral, or unclear, when supported by evidence. Use domain-appropriate risk or outlook terminology where bullish/bearish does not fit.

Explain the main supporting and contradictory signals. A positive event does not automatically make the day bullish, and a negative event does not automatically make it bearish.

Identify material upcoming catalysts and plausible future implications. Distinguish confirmed events from conditional possibilities. Do not invent dates, forecasts, price targets, probabilities, or unsupported causal chains.

## 6. Accuracy and limitations

The available records are not a complete account of everything that happened during the day. Never imply otherwise.

Treat indicators, observations, and research as evidence to assess, not unquestionable truth. Preserve important contradictions, missing information, stale measurements, source limitations, and uncertainty.

Never invent facts, values, dates, sources, identifiers, research findings, market reactions, or historical comparisons. Do not interpret missing data as zero.

Preserve supplied identifiers so material conclusions remain traceable. Distinguish event dates, reporting dates, and indicator observation dates.

Do not interpret the absence of a recorded event as evidence that it did not occur.

## 7. Output requirements

Follow the exact JSON structure supplied in the invocation instructions. Do not add top-level fields or return commentary outside the requested structure.

Include distinct sections for:
- Overall assessment.
- Significant indicator changes.
- Observation summaries.
- Research summaries.
- Daily synthesis and relationships.
- Directional assessment or sentiment.
- Future implications and catalysts.
- Uncertainties and data-quality limitations.

Keep summaries concise and information-dense. Include all distinct supplied observations and research records, but do not give every item equal analytical depth.

Avoid repeating the same information across sections. Use additional detail only when it materially improves understanding, traceability, or accuracy.

Return only the requested output structure.
`;

/** The analyst's per-run instructions: the period, the domain, and the three inputs. */
const analystPrompt = (
  intelligenceSet: DailySet,
  config: ObserverConfig,
  currentData: string,
  observations: string,
  researchRecords: string,
): string => `
# Daily Domain Intelligence Brief

## Intelligence metadata

- Intelligence set ID: ${intelligenceSet.id}
- Intelligence date: ${intelligenceSet.set_date}
- Domain ID: ${config.domain}
- Domain objective: ${config.objective}
- Domain priorities: ${config.categories.join(", ")}

## Input coverage

The following inputs represent the deterministic indicators, the observations, and the completed research available to this system for the specified domain and intelligence period.

They are supplied in that order deliberately: the indicators establish what the market actually did, and the observations and research below are read against that baseline.

They are not guaranteed to represent every event that occurred during the day.

Do not interpret missing events or data as evidence that nothing happened.

## 1. Domain-specific deterministic indicator data

These are the indicator readings selected for ${config.domain}.

Review the available values, changes, comparisons, timestamps, units, and metadata. Identify meaningful movements and levels, and relate them to observations and research only where supported by evidence.

Do not assume that every observation is from today or that every indicator has updated today.

${currentData}

## 2. All recorded daily observations

Every observation below belongs to this intelligence set and domain, including observations that were not selected for deeper research.

Read all observations. Summarize notable observations, preserve their identifiers, and consider whether they connect to researched developments or indicator movements.

Do not imply that an observation was independently verified unless the supplied evidence establishes that.

${observations}

## 3. Completed research records

These are the available research results associated with selected observations.

Each research record should receive its own concise 1–4 sentence summary, preserving its research and observation identifiers.

Each record carries an "importance" attribute: the researcher's own judgement of why that finding matters for this domain, made while the evidence was in front of it. Weigh records against each other using it, but do not treat it as the last word - it is one analyst's read, and your own assessment of what matters for the day governs. Where "importance" is absent, judge significance from the record itself. Where it is present, say so when you disagree with it.

Use these records to explain, qualify, or challenge the original observations. Do not conduct additional research.

${researchRecords}



## Required analysis

Produce a structured brief with the following sections:

1. **Assessment:** The current state of the domain and the most important conclusions supported by the evidence.
2. **Indicator brief:** Meaningful indicator movements, important levels, relevant comparisons, and their significance. Include observation dates and units.
3. **Observation brief:** Concise summaries of notable recorded observations, including those not selected for research. Preserve observation IDs.
4. **Research brief:** A separate 1–4 sentence bullet for every supplied research record. Preserve research and observation IDs.
5. **Today's summary:** A concise synthesis of the most consequential recorded developments and meaningful data changes.
6. **Today's narrative:** Explain how the main developments fit together, if the evidence supports a coherent narrative. Do not force unrelated events into one story.
7. **Relationships and market implications:** Explain supported relationships between events, research, and indicator movements. Distinguish observed facts, interpretations, and conditional future implications.
8. **Directional assessment:** Describe the domain's overall tone using an appropriate classification. Use bullish/bearish for domains where that is meaningful, and risk-increasing/risk-reducing or another domain-appropriate classification where it is not. Use Mixed or Unclear when justified.
9. **Upcoming catalysts:** Include supported future events, decisions, or conditional developments that could materially change the assessment.
10. **Uncertainties and coverage:** Record important contradictions, stale or missing data, weakly supported claims, and limits of the available observations and research.

## Analytical rules

- Prioritize significance, not input order or quantity.
- Do not omit an observation merely because it was not researched.
- Do not imply that the available record contains every event from the day.
- Do not invent facts, narratives, causal links, sentiment, or missing values.
- Preserve source, observation, research, and indicator references exactly.
- Do not mistake correlation for causation.
- Clearly qualify possible future outcomes.
- Keep each section concise and avoid repeating the same explanation unnecessarily.
- Use empty arrays for collection fields when there are no supported findings.
- Use null for unavailable scalar values.
- Return valid JSON only, matching the required output schema exactly.
`;

// --------------------------------------------------
// Run
// --------------------------------------------------

export type BriefAnalystOutcome = {
  domain: string;
  date: string;
  intelligenceSetId: string;
  /** Research records supplied to the analyst. */
  researchSupplied: number;
  /** Indicator tokens in the analyst's context. */
  contextTokens: number;
  /** Whether the analyst phase produced parseable JSON. */
  analystParsed: boolean;

  /**
   * How long the analyst phase took, in seconds.
   *
   * Reported separately from the briefs' own timings because this is by far the
   * slowest of the three - it is the only phase with tools and the only one sending
   * tens of thousands of context tokens.
   */
  analystSeconds: number;
  /**
   * The finished human brief, or `null` when that brief failed.
   *
   * `unknown` rather than a schema type: the editor prompt deliberately leaves the
   * shape to the model, so there is no contract to type it against yet. Tighten
   * this once the shape settles across runs.
   */
  humanBrief: unknown;
  /**
   * The machine-readable intelligence context, or `null` when that brief failed.
   *
   * `unknown` for the same reason as {@link BriefAnalystOutcome.humanBrief}, and
   * independently: the two briefs are produced by separate prompts and may be
   * shaped differently.
   */
  aiContextBrief: unknown;
};

/**
 * Produces one domain's brief for one intelligence set.
 *
 * `config` is the observer config for the domain, reused rather than duplicated:
 * its `objective` becomes the brief's domain description, its `categories` the
 * domain's priorities, and its `foundationalData` the indicator set. One config
 * per domain means the brief and the observations it summarizes cannot disagree
 * about what a domain covers.
 *
 * Skips the model entirely when the domain has no researched observations. A brief
 * with no research to synthesize is an empty document, and generating one costs a
 * request.
 *
 * Runs all three agents and returns both briefs. Either may be `null` without
 * failing the run: they answer different questions, so one being lost should not
 * cost the other.
 *
 * The run log is written whatever happens, so a failed run still leaves the
 * analyst's reasoning and its raw output behind.
 */
export const runBriefAnalyst = async (
  intelligenceSet: DailySet,
  config: ObserverConfig,
): Promise<BriefAnalystOutcome> => {
  console.log(
    `[brief] Brief analyst initialized for domain: ${config.domain} - ` +
      `set ${intelligenceSet.id} (${intelligenceSet.set_date})`,
  );

  const runLog = await createBriefAnalystRunLog();

  // --------------------------------------------------
  // Gather the domain's inputs
  // --------------------------------------------------

  // Read back from the set rather than taking a list from the caller, so the brief
  // summarizes what is actually stored rather than what a caller believed it stored.
  const storedResearch = (await fetchResearchForSet(intelligenceSet)).filter(
    (row) => row.market_domain === config.domain,
  );

  // Every observation for the set and domain, researched or not.
  //
  // The analyst's instructions are explicit that an observation is eligible for the
  // brief whether or not Triage selected it, and that it must not be dropped for
  // going unresearched. On the current set that is 35 observations of which 17 were
  // never researched - so reading only the researched ones would have discarded
  // roughly half the record, which is the opposite of what the prompt asks for.
  //
  // Whether each one was researched is stated inline rather than left implicit, so
  // the analyst can tell "recorded but not investigated" from "investigated and
  // found unremarkable" instead of treating silence as verification.
  const observations = await fetchObservationsForSet(intelligenceSet, config.domain);

  const dailyObservations =
    observations.rows.length === 0
      ? "No daily observations are available for this domain and period."
      : observations.rows
          .map(
            (row) =>
              `<observation id="${row.id}" type="${row.type}" researched="${row.research_enabled}">
${row.observation}
</observation>`,
          )
          .join("\n\n");

  const unresearchedCount = observations.rows.filter((row) => !row.research_enabled).length;

  const researchRecords =
    storedResearch.length === 0
      ? "No research records are available for this domain and period."
      : storedResearch
          .map((row) => {
            // The stored column is the researcher's JSON as one opaque text blob. It is
            // parsed here only to lift `importance` and `status` onto the tag, so the
            // analyst sees them as attributes it can weigh rather than as prose buried
            // inside the record.
            //
            // The parse is best-effort by design: a record written before a field
            // existed, or by a schema that has since changed, still renders - just
            // without those two attributes. The full text is emitted either way, so
            // nothing is lost by a record that will not parse.
            //
            // This also corrects a labelling error: the `status` attribute used to be
            // bound to the row's `type`, which is the observation's category, so every
            // record claimed to be an event regardless of its verification status.
            const parsed = parseStoredResearch(row.research);

            const attributes = [
              `observationId="${row.observation_id}"`,
              parsed.status === null ? "" : `status="${parsed.status}"`,
              parsed.importance === null ? "" : `importance="${parsed.importance}"`,
            ].filter((attribute) => attribute !== "");

            return `<research ${attributes.join(" ")}>
${row.research}
</research>`;
          })
          .join("\n\n");

  const currentData = await indicatorContextFor(INDICATOR_SCOPE, config);

  const contextTokens = estimateTokens({
    dailyObservations,
    researchRecords,
    currentData,
  });

  // --------------------------------------------------
  // What the analyst is being initialized with
  // --------------------------------------------------

  // The prompt itself, assembled once so the log, the terminal and the model call
  // cannot each build a slightly different one.
  const analystDevPrompt = analystPrompt(
    intelligenceSet,
    config,
    currentData,
    dailyObservations,
    researchRecords,
  );

  const observationTokens = estimateTokens(dailyObservations);
  const researchTokens = estimateTokens(researchRecords);
  const indicatorTokens = estimateTokens(currentData);

  // The metadata block is short enough to print verbatim, and it is the part a
  // reviewer actually needs to see - the set, the date, the domain's objective and
  // its priorities. The inputs behind it are tens of thousands of tokens and go to
  // the run log instead, where they can be read without flooding a terminal.
  console.log(
    [
      `[brief] Analyst prompt initialized for domain: ${config.domain}`,
      `  set            : ${intelligenceSet.id} (${intelligenceSet.set_date})`,
      `  description    : ${config.objective}`,
      `  priorities     : ${config.categories.join(", ")}`,
      `  observations   : ${observations.rows.length} total, ${unresearchedCount} not researched, ${observationTokens} tokens`,
      `  research       : ${storedResearch.length} record(s), ${researchTokens} tokens`,
      `  indicators     : ${INDICATOR_SCOPE} scope, ${indicatorTokens} tokens`,
      `  total context  : ${contextTokens} tokens`,
      `  system prompt  : ${analystSystemPrompt.length} characters`,
      `  user prompt    : ${analystDevPrompt.length} characters`,
      `  tools          : ${ANALYST_TOOLS.join(", ")}`,
    ].join("\n"),
  );

  await runLog.record("initializer", {
    domain: config.domain,

    intelligenceSetId: intelligenceSet.id,

    intelligenceDate: intelligenceSet.set_date,

    model: modelIdOf(modelPick),

    maxAgentSteps: MAX_AGENT_STEPS,

    reasoningEffort: REASONING_EFFORT,

    tools: ANALYST_TOOLS,

    // Which indicator scope the prompt was built from, so a run log says whether a
    // brief had the whole dataset or only the domain's own indicators.
    indicatorScope: INDICATOR_SCOPE,

    researchSupplied: storedResearch.length,

    // The observation count is split, because the analyst is told to read the
    // unresearched ones too and a run log should show that it was given them.
    observationsSupplied: observations.rows.length,

    unresearchedSupplied: unresearchedCount,

    observationTokens,

    researchTokens,

    indicatorTokens,

    contextTokens,
  });

  // The full prompts, verbatim. The terminal log above gives the shape and the
  // sizes because the inputs are tens of thousands of tokens; this is where they can
  // actually be read. Recorded before the model call so a run that dies mid-flight
  // still leaves what it was sent.
  await runLog.record("prompt", {
    phase: "analyst",

    // The metadata block on its own, so the small part is readable without pulling
    // the large part out of it.
    metadata: {
      intelligenceSetId: intelligenceSet.id,
      intelligenceDate: intelligenceSet.set_date,
      domain: config.domain,
      domainDescription: config.objective,
      domainPriorities: config.categories,
    },

    systemPrompt: analystSystemPrompt,

    userPrompt: analystDevPrompt,

    tokens: {
      observations: observationTokens,
      research: researchTokens,
      indicators: indicatorTokens,
      totalContext: contextTokens,
      systemPromptCharacters: analystSystemPrompt.length,
      userPromptCharacters: analystDevPrompt.length,
    },
  });

  if (storedResearch.length === 0) {
    await runLog.record("brief_skipped", {
      reason: `No researched observations for ${config.domain} on ${intelligenceSet.set_date}.`,
    });

    await runLog.finish();

    console.log(
      `[brief] Brief analyst finalized for domain: ${config.domain} - ` +
        `skipped, no research records`,
    );

    return {
      domain: config.domain,
      date: intelligenceSet.set_date,
      intelligenceSetId: intelligenceSet.id,
      researchSupplied: 0,
      contextTokens,
      analystParsed: false,
      analystSeconds: 0,
      humanBrief: null,
      aiContextBrief: null,
    };
  }

  // --------------------------------------------------
  // Phase one: analyse
  // --------------------------------------------------

  // Tools, so structured output is unavailable: the provider rejects JSON mode
  // combined with tool calling. The analyst therefore returns JSON as text and the
  // formatter below is what enforces the schema.
  // The analyst can sit silent for several minutes while the provider thinks, and
  // silence is indistinguishable from a hang. The briefs get the same treatment in
  // `generateBrief`; it is written again here rather than shared because this call
  // uses `generateText`, which exposes no text stream to count characters against -
  // step count is the only progress available.
  const analystStartedAt = Date.now();

  let analystStepsDone = 0;

  const analystHeartbeat = setInterval(() => {
    console.log(
      `     [waiting] ${Math.round((Date.now() - analystStartedAt) / 1000)}s elapsed, ` +
        `${analystStepsDone} of ${MAX_AGENT_STEPS} step(s) complete`,
    );
  }, 10_000);

  let analystResult;

  try {
    analystResult = await generateText({
      model: modelPick,

      instructions: analystSystemPrompt,

      prompt: analystDevPrompt,

      tools: getAgenticTooling({ tools: [...ANALYST_TOOLS] }),

      stopWhen: isStepCount(MAX_AGENT_STEPS),

      maxOutputTokens: MAX_ANALYST_OUTPUT_TOKENS,

      providerOptions: { groq: { reasoningEffort: REASONING_EFFORT } },

      onStepEnd: async (step) => {
        analystStepsDone += 1;

        await runLog.record("analyst_step", normalizeStep(step));
      },
    });
  } finally {
    // Cleared even on a throw, so a failed call does not leave the interval running
    // and keep logging for the rest of the process.
    clearInterval(analystHeartbeat);
  }

  const analystSeconds = Math.round((Date.now() - analystStartedAt) / 1000);

  const analystText = analystResult.text;

  const analystSteps = await analystResult.steps;
  const analystUsage = await analystResult.totalUsage;

  // Recorded because a response cut off mid-JSON looks identical to a complete
  // one: 'length' is a token ceiling, 'other' is the provider giving up, 'stop' is
  // simply finished.
  const analystFinishReason = analystResult.finishReason;

  console.log(
    `[brief] Brief analyst response for domain: ${config.domain} - ` +
      `finishReason=${analystFinishReason} text=${analystText.length} chars in ${analystSeconds}s ` +
      `across ${analystSteps.length} step(s) ` +
      `input=${analystUsage.inputTokens ?? "?"} output=${analystUsage.outputTokens ?? "?"}`,
  );

  await runLog.record("analyst_output", {
    finishReason: analystFinishReason,

    characters: analystText.length,

    seconds: analystSeconds,

    text: analystText,
  });

  let lastReasoningText: string | null = null;

  for (const step of analystSteps) {
    const reasoningText = getReasoningText(step);

    if (reasoningText) {
      lastReasoningText = reasoningText;
    }
  }

  await runLog.record("reasoning", { phase: "analyst", reasoning: lastReasoningText });

  await runLog.record("usage", {
    phase: "analyst",

    cumulativeInputTokens: analystUsage.inputTokens ?? null,

    outputTokens: analystUsage.outputTokens ?? null,

    stepInputTokens: analystSteps.map((step) => {
      const usage = step.usage as { inputTokens?: number } | undefined;

      return usage?.inputTokens ?? null;
    }),

    steps: analystSteps.length,

    finishReason: analystFinishReason,
  });

  // The analyst's JSON is parsed, not validated. Its job here is only to confirm
  // the response is object-shaped; the formatter decides whether the brief is
  // usable, and a human decides whether it is good.
  let analystParsed = false;
  let analystJson = analystText;

  try {
    analystJson = JSON.stringify(parseAnalystBrief(analystText));

    analystParsed = true;
  } catch (error) {
    await runLog.record("analyst_parse_failure", {
      error: error instanceof Error ? error.message : String(error),
      finishReason: analystFinishReason,
      characters: analystText.length,
    });
  }

  // Space the two requests to the same provider.
  if (STEP_DELAY_MS > 0) {
    await sleep(STEP_DELAY_MS);
  }

  // Phases two and three: the briefs
  // --------------------------------------------------

  // Both briefs are generated from `analystJson` here, in this same process. The
  // run log is a record of what the run produced, never an input to it - reading
  // the analyst's output back out of the JSON to feed a brief would make a
  // diagnostic artifact a production dependency, and would mean paying for the
  // analyst twice.
  //
  // Neither brief is schema-constrained, and neither shape is declared here: each
  // prompt sets its own. `Output.object` was tried and removed - it made the SDK
  // throw outright on a schema mismatch, discarding the response instead of falling
  // back to its text.
  //
  // A failure is confined to its own brief. The two answer different questions
  // about the same day, so losing one must not discard the other, and neither is
  // worth failing the run over.
  const produced = new Map<string, BriefGenerationResult>();

  const briefs = [
    {
      key: "human_brief",
      label: "Human brief",
      run: runHumanBriefPhase,
      sliders: HUMAN_BRIEF_SLIDERS,
    },
    {
      key: "ai_context_brief",
      label: "AI context brief",
      run: runAiContextBriefPhase,
      sliders: AI_CONTEXT_BRIEF_SLIDERS,
    },
  ];

  for (const { key, label, run, sliders } of briefs) {
    try {
      const result = await run(analystJson, config.domain, sliders);

      produced.set(key, result);

      // The raw text as well as the parsed brief: the prompts forbid fences and
      // commentary, so a parse failure means something unexpected is in here.
      await runLog.record(`${key}_output`, {
        finishReason: result.finishReason,
        characters: result.text.length,
        seconds: result.seconds,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,

        // Where the analyst input needed the comma repair, so a brief built on a
        // repaired input is never mistaken for one built on the original.
        repairedAnalystJsonAt: result.repairedAt,

        text: result.text,
      });

      await runLog.record(key, { briefSource: "text (parsed)", brief: result.brief });

      console.log(
        `[brief] ${label} recorded for domain: ${config.domain} ` +
          `(${result.text.length} characters)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Full diagnostic to the terminal, including the error's `cause`.
      logFormatterError(error, {
        domain: config.domain,
        intelligenceSetId: intelligenceSet.id,
        intelligenceDate: intelligenceSet.set_date,
        stage: key,
        analystParsed,
        analystFinishReason,
        analystCharacters: analystText.length,
      });

      await runLog.record(`${key}_failure`, {
        error: message,
        name: error instanceof Error ? error.name : typeof error,
        cause:
          error instanceof Error && error.cause instanceof Error
            ? { name: error.cause.name, message: error.cause.message }
            : error instanceof Error
              ? (error.cause ?? null)
              : null,
        analystParsed,
        analystCharacters: analystText.length,
        analystFinishReason,
      });

      // Not rethrown: the analyst's output and the other brief are already in the
      // log, and these runs exist to see what came back.
      console.log(
        `[brief] ${label} failed for domain: ${config.domain} - ${message.slice(0, 120)}`,
      );
    }

    // Space consecutive requests to the same provider.
    if (STEP_DELAY_MS > 0) {
      await sleep(STEP_DELAY_MS);
    }
  }

  const humanBrief = produced.get("human_brief") ?? null;
  const aiContextBrief = produced.get("ai_context_brief") ?? null;

  await runLog.finish();

  await runLog.record("summary", {
    domain: config.domain,
    analystParsed,
    analystSeconds,
    researchSupplied: storedResearch.length,
    briefs: {
      human_brief: humanBrief !== null,
      ai_context_brief: aiContextBrief !== null,
    },
  });

  console.log(
    `[brief] Brief analyst finalized for domain: ${config.domain} - ` +
      `${storedResearch.length} research record(s), ${contextTokens} context tokens, ` +
      `analyst ${analystSeconds}s, ` +
      `human brief ${humanBrief === null ? "failed" : `${humanBrief.seconds}s`}, ` +
      `AI context brief ${aiContextBrief === null ? "failed" : `${aiContextBrief.seconds}s`}`,
  );

  return {
    domain: config.domain,
    date: intelligenceSet.set_date,
    intelligenceSetId: intelligenceSet.id,
    researchSupplied: storedResearch.length,
    contextTokens,
    analystParsed,
    analystSeconds,
    humanBrief: humanBrief?.brief ?? null,
    aiContextBrief: aiContextBrief?.brief ?? null,
  };
};
