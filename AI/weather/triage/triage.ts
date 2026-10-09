/**
 * Triage: labels a domain's observations important or not, and promotes the
 * important ones.
 *
 * Reads every observation recorded for a date, has an agent decide which are
 * important signals, then flips `research_enabled` from false to true on those and
 * on nothing else. It does not order them, edit observation text, or decide
 * anything beyond that one label.
 *
 * Triage is a filter, not a ranking. There is no order, no position, and no
 * comparison between observations: each one is judged on its own against the
 * domain's bar for what deserves research. Nothing downstream consumes an order,
 * and the database has nowhere to put one.
 *
 * This file holds the prompts, the model call and the orchestration. What a
 * decision means, how one is read out of a model response, and where the dated
 * record is written all live in AI/utils/weather/triage.ts.
 *
 *   npx tsx AI/weather/triage/triage.ts
 *
 * Two artifacts:
 *   AI/data/database Fetcher/triage/triage-<date>-<domain>.json  what was labeled, and what changed
 *   AI/data/Weather Triage/Weather Triage-NNN.json               the run log, as for the Observer
 */

import { Output, generateText } from "ai";

import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../../config/database.js";

import { models } from "../../providers/model.js";

import { getReasoningText, modelIdOf, normalizeStep } from "../../utils/agent.js";
import { estimateTokens } from "../../utils/general.tools.js";
import { createAgentRunLog } from "../../utils/logger.js";
import {
  parseTriageResult,
  triageSchema,
  writeTriageRecord,
  type TriageDecision,
  type TriageSchema,
} from "../../utils/weather/triage.js";

import {
  enableResearchForIds,
  fetchObservationsForSet,
  type ObservationDay,
} from "../../utils/weather/dbFetcher.triage.js";

import { getDailySet, type DailySet } from "../../utils/weather/observations.js";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

/**
 * The model that triages.
 *
 * Defaults to Google rather than `models.openrouter`: the free router has been
 * returning unusable text for this pipeline, and triage depends entirely on one
 * response parsing cleanly. Change it here and nothing else.
 */
const modelPick = models.groq;

/**
 * This agent's name.
 *
 * Names the run-log folder and file, so one value identifies the agent
 * everywhere.
 */
const AGENT_NAME = "Weather Triage";

/**
 * Ceiling on the agent's output tokens.
 *
 * Without one, gpt-oss-120b answers against a 3072-token default and gets cut off
 * mid-thought. Run 001 spent 3070 of those 3072 on reasoning, emitted 2 text
 * tokens, and finished with `finishReason: "length"` and an empty response. A day
 * of labels plus their reasons needs room well past that.
 */
const MAX_OUTPUT_TOKENS = 8_192;

/**
 * Reasoning effort for the triage call.
 *
 * Triage is a per-observation yes/no label over a fixed list, not open-ended
 * analysis, so the model's default reasoning budget is disproportionate to the
 * task: it enumerated its labels into the reasoning stream, one observation at a
 * time, and reached
 * number 17 of 20 before the ceiling stopped it. `low` keeps enough reasoning for
 * the run log to be worth reading without letting it crowd out the response.
 *
 * Honoured by @ai-sdk/groq and ignored by providers that do not expose it, which
 * is why {@link MAX_OUTPUT_TOKENS} is the backstop rather than the fix.
 */
const REASONING_EFFORT = "low" as const;

// --------------------------------------------------
// Triage
// --------------------------------------------------

export type TriageOutcome = {
  date: string;
  marketDomain: string;
  intelligenceSetId: string;
  considered: number;
  promoted: number;
  importantIds: string[];
  /** Ids the agent returned that are not in the day's rows. */
  unknownIds: string[];
  /** Ids the agent failed to mention, which stay unpromoted. */
  missingIds: string[];
  recordFile: string;
};

/**
 * Triages one domain's observations for one intelligence set, and promotes the
 * ones the agent flagged.
 *
 * `intelligenceSet` is required, and that is the point: triage reads the same set
 * the Observer wrote to, so a day's observations are labelled and promoted under
 * the one id that chains them together. Scoping by the set rather than by
 * `date` also means triage cannot drift onto rows that merely share a calendar
 * date - see fetchObservationsForSet.
 *
 * `marketDomain` is required rather than optional. Triaging every domain in one
 * pass would be wrong, not merely coarser: what counts as an important signal is
 * domain-specific, so a handful of weather observations judged beside a hundred
 * crypto ones would be held to the wrong bar. Making the argument mandatory also
 * means a caller cannot silently triage the whole set by forgetting it.
 *
 * The run log is written whatever happens, so a run that fails still leaves the
 * reasoning and steps behind.
 */
export const runTriage = async (
  intelligenceSet: DailySet,
  marketDomain: string,
): Promise<TriageOutcome> => {
  console.log(
    `[triage] Triage run initialized for domain: ${marketDomain} - ` +
      `set ${intelligenceSet.id} (${intelligenceSet.set_date})`,
  );

  const runLog = await createAgentRunLog(AGENT_NAME);

  // --------------------------------------------------
  // Read the set
  // --------------------------------------------------

  const day: ObservationDay = await fetchObservationsForSet(intelligenceSet, marketDomain);

  const { rows, date } = day;

  await runLog.record("initializer", {
    date,

    marketDomain,

    // The set under triage, so a run log says which day's work it acted on.
    intelligenceSetId: intelligenceSet.id,

    model: modelIdOf(modelPick),

    maxOutputTokens: MAX_OUTPUT_TOKENS,

    reasoningEffort: REASONING_EFFORT,

    rowCount: rows.length,

    // Scoping is by set, so this should always be 0. Recorded because a non-zero
    // value would mean a row carries a date other than its set's, which is
    // exactly the drift that set-scoping exists to prevent.
    rowsWithMismatchedDate: rows.filter((row) => row.date !== date).length,

    // How many rows were already promoted when this run started, so a repeat run
    // is distinguishable from one that did the work.
    alreadyEnabled: rows.filter((row) => row.research_enabled).length,
  });

  // Nothing to ask about. Recorded and returned rather than calling the model with
  // an empty list, which would cost a request to label nothing.
  if (rows.length === 0) {
    await runLog.record("triage_skipped", {
      reason: `No observations recorded for ${date} in ${marketDomain}.`,
    });

    const recordFile = await writeTriageRecord({
      date,
      marketDomain,
      intelligenceSetId: intelligenceSet.id,
      rows,
      decisions: [],
      unknownIds: [],
      missingIds: [],
      promoted: 0,
      finishReason: null,
      recordSection: "triage_skipped",
    });

    await runLog.finish();

    console.log(
      `[triage] Triage run finalized for domain: ${marketDomain} - ` +
        `considered 0, promoted 0 (skipped, no observations)`,
    );

    return {
      date,
      marketDomain,
      intelligenceSetId: intelligenceSet.id,
      considered: 0,
      promoted: 0,
      importantIds: [],
      unknownIds: [],
      missingIds: [],
      recordFile,
    };
  }

  // --------------------------------------------------
  // Prompts
  // --------------------------------------------------

  // Only the fields triage needs. The id is what the agent must echo back, so it
  // has to be in the prompt; the rest of the row is provenance, not input.
  const triageInput = {
    date,

    marketDomain,

    observations: rows.map((row) => ({
      id: row.id,
      type: row.type,
      observation: row.observation,
    })),
  };

  const embeddedInput = JSON.stringify(triageInput, null, 2);

  const initialContextTokens = estimateTokens(embeddedInput);

  const systemPrompt = `
  You are the Triage agent in a market intelligence pipeline.
  
  Pipeline:
  Observer = broad signal discovery
  Triage = important-signal labeling
  Research = investigation and evidence
  Lead = daily brief synthesis
  
  The Observer scans a broad surface area and produces a large set of daily observations. Your sole job is to identify which observations are important enough to be researched and considered for the daily brief.
  
  You are NOT a ranker, researcher, or analyst.
  
  Do not rank observations.
  Do not investigate them.
  Do not search for additional information.
  Do not explain causes.
  Do not determine the final significance or implications of an event.
  Do not write the daily brief.
  
  Simply label each observation as important or not important for downstream research.
  
  1. IMPORTANT SIGNAL
  
  Set important: true when the observation represents a meaningful daily signal that deserves research and potential inclusion in the daily brief.
  
  Strong candidates include:
  - large, unusual, or extreme market movements
  - major changes in market conditions or structure
  - important regulatory, political, geopolitical, or macro developments
  - enforcement actions, sanctions, legislation, exploits, failures, or security incidents
  - major institutional, corporate, protocol, or infrastructure developments
  - events that materially change the state of the domain
  - credible breaking or emerging developments that could meaningfully affect the domain or its markets
  - important developments that a reader of the daily brief would reasonably need to know about
  
  Normally set important: false for:
  - ordinary market movements
  - routine or expected developments
  - minor changes without meaningful significance
  - duplicate or repetitive coverage
  - restatements of information already represented by another observation
  - opinions or predictions without a meaningful new development
  - generic sentiment or commentary
  - weak speculation
  - observations that are interesting but do not deserve research space in the daily brief
  
  Judge the observation as a daily news signal, not as an abstractly interesting fact.
  
  The key question is:
  
  "Is this important enough that we should spend research effort investigating it and potentially include it in today's brief?"
  
  When uncertain, prefer false. Research capacity should be reserved for the strongest signals.
  
  2. OBSERVATION CONTENT
  
  The Observer may provide a headline or short reported development without researching it. That is expected.
  
  You do not need to verify whether the observation is true. Research will verify important observations downstream.
  
  Do not penalize an observation merely because it lacks detailed evidence.
  
  Instead, judge whether the reported development is important enough to warrant investigation.
  
  3. DUPLICATES
  
  The Observer should already merge obvious duplicates.
  
  If multiple observations describe the same underlying event, do not mark redundant copies as important simply because they appear separately.
  
  4. REASON
  
  For every observation, provide exactly one concise sentence explaining why it was or was not selected for research.
  
  Base the reason only on the observation provided.
  
  Do not add facts.
  Do not speculate.
  Do not research.
  Do not rewrite the observation.
  
  5. IDS
  
  Copy every id exactly as provided.
  
  Return exactly one result for every input observation.
  
  Do not add observations.
  Do not remove observations.
  Do not modify or invent ids.
  
  Return ONLY valid JSON matching this structure:
  
  {
    "signals": [
      {
        "id": "exact input id",
        "important": true,
        "reason": "one concise sentence"
      }
    ]
  }
  
  Do not include Markdown, code fences, commentary, or additional fields.
  `;

  const devPrompt = `
  Triage the ${date} ${marketDomain} observation inventory.
  
  Label each observation as important or not important based on whether it deserves downstream research and potential inclusion in the daily brief.
  
  Every observation below belongs to ${marketDomain}. Judge each one on its own against what matters in ${marketDomain} specifically. A development that would be routine in one domain may be material in this one. Do not compare or order them.
  
  ${embeddedInput}
  
  Return exactly one signal entry for every ${rows.length} observation(s).
  `;

  // --------------------------------------------------
  // Agent
  // --------------------------------------------------

  // `generateText`, not `streamText`: this is one call whose entire output is
  // parsed, and a streamed response can arrive truncated mid-JSON, which is
  // indistinguishable from a complete one.
  const result = await generateText({
    model: modelPick,
    instructions: systemPrompt,
    prompt: devPrompt,

    maxOutputTokens: MAX_OUTPUT_TOKENS,

    providerOptions: { groq: { reasoningEffort: REASONING_EFFORT } },

    output: Output.object({
      schema: triageSchema,
      name: "triage_signals",
      description:
        "One label per input observation: whether it is an important signal worth research, and why.",
    }),

    onStepEnd: async (step) => {
      await runLog.record("step", normalizeStep(step));
    },
  });

  const finalText = result.text;

  // Why generation stopped. Without this a response cut off mid-JSON looks
  // identical to a complete one: 'length' means a token ceiling, 'other' means the
  // provider gave up, 'stop' means it finished.
  const finishReason = result.finishReason;

  const steps = await result.steps;
  const totalUsage = await result.totalUsage;

  await runLog.record("triage_output", { text: finalText });

  let lastReasoningText: string | null = null;

  for (const step of steps) {
    const reasoningText = getReasoningText(step);

    if (reasoningText) {
      lastReasoningText = reasoningText;
    }
  }

  await runLog.record("reasoning", lastReasoningText);

  await runLog.record("usage", {
    initialContextTokens,

    steps: steps.length,

    // The agent's usage is the sum across its steps, so the input count is a
    // running total rather than any one step's context.
    triageUsage: {
      ...totalUsage,
      inputTokens: undefined,
      cumulativeInputTokens: totalUsage.inputTokens ?? null,
    },

    // One call per step; with no tools there is a single step, whose input is the
    // context that step was sent.
    stepInputTokens: steps.map((step) => {
      const usage = step.usage as { inputTokens?: number } | undefined;

      return usage?.inputTokens ?? null;
    }),

    finishReason,
  });

  // finish() before parsing, so the raw response is on disk before anything throws.
  await runLog.finish(finalText);

  // --------------------------------------------------
  // Parse
  // --------------------------------------------------

  let decisions: TriageDecision[];

  try {
    // `output` is the schema-validated result and is preferred whenever the
    // provider honoured structured output. `finalText` is the fallback, and is
    // still what gets recorded, so a run that only worked because of the fallback
    // is visible in the log rather than looking identical to one that used the
    // schema.
    const structured = result.output as TriageSchema | undefined;

    if (structured) {
      await runLog.record("parse_source", "output (schema-validated)");

      decisions = structured.signals.map((entry) => ({
        id: entry.id,
        important: entry.important,
        reason: entry.reason,
      }));
    } else {
      await runLog.record(
        "parse_source",
        "text (fallback: provider returned no structured output)",
      );

      decisions = parseTriageResult(finalText);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // The parser's message is not enough on its own at the terminal. "0
    // characters" says nothing about why, and `length`, `content-filter` and
    // `stop` are three different bugs - so the reason travels with the error.
    await runLog.record("triage_failure", {
      error: message,
      characters: finalText.length,
      finishReason,
      text: finalText,
    });

    throw new Error(
      `Triage failed (finishReason: ${finishReason ?? "unknown"}, ` +
        `${finalText.length} characters). ${message}`,
    );
  }

  // --------------------------------------------------
  // Validate against the day's rows
  // --------------------------------------------------

  // The model names rows; it does not get to say which rows exist. Anything it
  // invented is reported rather than applied, and anything it forgot stays
  // unpromoted.
  const knownIds = new Set(rows.map((row) => row.id));

  const seen = new Set<string>();
  const unknownIds: string[] = [];
  const duplicateIds: string[] = [];

  for (const decision of decisions) {
    if (!knownIds.has(decision.id)) {
      if (!unknownIds.includes(decision.id)) unknownIds.push(decision.id);

      continue;
    }

    if (seen.has(decision.id)) {
      if (!duplicateIds.includes(decision.id)) duplicateIds.push(decision.id);

      continue;
    }

    seen.add(decision.id);
  }

  const missingIds = rows.map((row) => row.id).filter((id) => !seen.has(id));

  const importantIds = decisions
    .filter((decision) => decision.important && seen.has(decision.id))
    .map((decision) => decision.id);

  await runLog.record("decisions", {
    labeled: decisions.length,

    important: importantIds.length,

    // Reported rather than corrected: a response that lost or invented rows is a
    // fact about the run worth seeing next to the labels themselves.
    unknownIds,

    duplicateIds,

    missingIds,

    decisions,
  });

  // --------------------------------------------------
  // Promote
  // --------------------------------------------------

  const promoted = await enableResearchForIds(importantIds);

  await runLog.record("applied", {
    promoted,

    // Promotions this run was asked for but did not make, because a previous run
    // had already promoted them.
    alreadyEnabled: importantIds.length - promoted,

    importantIds,
  });

  // --------------------------------------------------
  // Dated record
  // --------------------------------------------------

  const recordFile = await writeTriageRecord({
    date,
    marketDomain,
    intelligenceSetId: intelligenceSet.id,
    rows,
    decisions,
    unknownIds,
    missingIds,
    promoted,
    finishReason,
  });

  console.log(
    `[triage] Triage run finalized for domain: ${marketDomain} - ` +
      `considered ${rows.length}, promoted ${promoted}`,
  );

  return {
    date,
    marketDomain,
    intelligenceSetId: intelligenceSet.id,
    considered: rows.length,
    promoted,
    importantIds,
    unknownIds,
    missingIds,
    recordFile,
  };
};

// --------------------------------------------------
// Entry point
// --------------------------------------------------

/**
 * Domain triaged when this file is run directly.
 *
 * A direct run has to name one: triage is per domain by design, so there is no
 * sensible default and guessing one would silently label the wrong set. Change
 * this to triage another domain by hand, or call `runTriage` from the pipeline
 * instead.
 */
const DIRECT_RUN_DOMAIN = "crypto";

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  // Resolved the same way the pipeline does, so a direct run labels the same set
  // a pipeline run would. Get-or-create, so this is today's set whether or not
  // one already exists.
  getDailySet()
    .then((intelligenceSet) => runTriage(intelligenceSet, DIRECT_RUN_DOMAIN))
    .then((outcome) => {
      console.log(
        `${outcome.date} ${outcome.marketDomain} (set ${outcome.intelligenceSetId}): ` +
          `considered ${outcome.considered}, promoted ${outcome.promoted}. ` +
          `Record -> ${outcome.recordFile}`,
      );
    })
    .catch((error: unknown) => {
      console.error("Triage failed:", error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
