/**
 * Triage: reranks a day's observations and promotes the important ones.
 *
 * Reads every observation recorded for a date, has an agent rerank them and judge
 * which are genuine signals, then flips `research_enabled` from false to true on
 * those and on nothing else. It does not rank in the database, edit observation
 * text, or decide anything beyond that one flag.
 *
 *   npx tsx AI/weather/triage/triage.ts
 *
 * Two artifacts:
 *   AI/data/database Fetcher/triage/triage-<date>.json  what was triaged, and what changed
 *   AI/data/Weather Triage/Weather Triage-NNN.json      the run log, as for the Observer
 */

import { Output, generateText } from "ai";
import { z } from "zod";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../../config/database.js";

import { models } from "../../providers/model.js";

import { getReasoningText, normalizeStep } from "../../utils/agent.js";
import { estimateTokens } from "../../utils/general.tools.js";
import {
  createAgentRunLog,
  AGENT_RUN_LOG_DIR,
  toPathSegment,
  toReadableJson,
} from "../../utils/logger.js";
import { extractJsonObject } from "../../utils/weather/observations.js";

import {
  enableResearchForIds,
  fetchObservationsForDate,
  type ObservationDay,
} from "../../utils/weather/dbFetcher.triage.js";

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
 * The date to triage, as `YYYY-MM-DD`.
 *
 * `null` means the database's `CURRENT_DATE`, which is what a daily run wants -
 * see fetchObservationsForDate. Set a value to re-triage an earlier day.
 */
const TRIAGE_DATE: string | null = null;

/**
 * This agent's name.
 *
 * Names the run-log folder and file, so one value identifies the agent
 * everywhere.
 */
const AGENT_NAME = "Weather Triage";

/** Where the dated triage record is written, relative to AI/data. */
const TRIAGE_RECORD_DIR = path.join("database Fetcher", "triage");

/**
 * Ceiling on the agent's output tokens.
 *
 * Without one, gpt-oss-120b answers against a 3072-token default and gets cut off
 * mid-thought. Run 001 spent 3070 of those 3072 on reasoning, emitted 2 text
 * tokens, and finished with `finishReason: "length"` and an empty response. A day
 * of rankings plus their reasons needs room well past that.
 */
const MAX_OUTPUT_TOKENS = 8_192;

/**
 * Reasoning effort for the triage call.
 *
 * Triage is classification over a fixed list, not open-ended analysis, so the
 * model's default reasoning budget is disproportionate to the task: it enumerated
 * its ranking into the reasoning stream, one observation at a time, and reached
 * number 17 of 20 before the ceiling stopped it. `low` keeps enough reasoning for
 * the run log to be worth reading without letting it crowd out the response.
 *
 * Honoured by @ai-sdk/groq and ignored by providers that do not expose it, which
 * is why {@link MAX_OUTPUT_TOKENS} is the backstop rather than the fix.
 */
const REASONING_EFFORT = "low" as const;

// --------------------------------------------------
// Model response
// --------------------------------------------------

export type TriageDecision = {
  id: string;
  important: boolean;
  reason: string;
};

/**
 * The shape the agent must return.
 *
 * Enforced by the SDK through structured output rather than asked for in prose.
 * Run 002 returned a well-formed array of decisions under the key `signals`
 * instead of `rankings`, and a prompt instruction did not prevent it: the prose
 * that described the job talked about finding signals, and the model named the
 * array after that. A model picking its own key name for data the pipeline then
 * reads by key is a failure waiting to happen, so the schema is the contract and
 * the prompt only carries the judgement.
 *
 * Every field is required because structured output is validated against the
 * schema rather than parsed afterwards, so there is no point tolerating a missing
 * `reason`: an empty string carries the same meaning and one less code path.
 */
const triageSchema = z.object({
  rankings: z.array(
    z.object({
      id: z.string().min(1),
      important: z.boolean(),
      reason: z.string(),
    }),
  ),
});

type TriageSchema = z.infer<typeof triageSchema>;

export type TriageRanking = {
  /** Ids in the order the agent ranked them, most important first. */
  rankOrder: string[];
  decisions: TriageDecision[];
};

/**
 * Turns the agent's response into a ranking.
 *
 * Throws rather than returning an empty list, so an unusable response fails the
 * run loudly instead of quietly promoting nothing. The raw text is in the run log
 * either way.
 *
 * Entries missing an `id` or `important` are dropped rather than guessed at, and
 * the caller is told how many, so a partially malformed response is visible
 * instead of silently triaging a subset.
 */
export const parseTriageRanking = (finalText: string): TriageRanking => {
  const received = (text: string): string => {
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;

    return `${text.length} characters: ${JSON.stringify(preview)}`;
  };

  const json = extractJsonObject(finalText);

  if (json === null) {
    throw new Error(`Triage response contained no JSON object. Received ${received(finalText)}`);
  }

  let parsed: { rankings?: unknown };

  try {
    parsed = JSON.parse(json) as { rankings?: unknown };
  } catch (error) {
    throw new Error(
      `Triage response was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Received ${received(finalText)}`,
    );
  }

  if (!Array.isArray(parsed.rankings)) {
    throw new Error(`Triage response had no "rankings" array. Received ${received(finalText)}`);
  }

  const decisions: TriageDecision[] = [];

  for (const entry of parsed.rankings) {
    const row = entry as Partial<TriageDecision> | null;

    if (!row || typeof row.id !== "string" || typeof row.important !== "boolean") {
      continue;
    }

    decisions.push({
      id: row.id,
      important: row.important,
      reason: typeof row.reason === "string" ? row.reason.trim() : "",
    });
  }

  return {
    // The array order is the ranking, so it is preserved rather than sorted.
    rankOrder: decisions.map((decision) => decision.id),
    decisions,
  };
};

// --------------------------------------------------
// Triage
// --------------------------------------------------

export type TriageOutcome = {
  date: string;
  marketDomain: string;
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
 * Triages one domain's observations for a day and promotes the ones the agent
 * flagged.
 *
 * `marketDomain` is required rather than optional. Triaging every domain in one
 * pass would be wrong, not merely coarser: importance is judged relative to the
 * set being ranked, and a handful of weather signals sitting in front of a
 * hundred crypto ones would be measured against the wrong baseline. Making the
 * argument mandatory also means a caller cannot silently triage the whole day by
 * forgetting it.
 *
 * The run log is written whatever happens, so a run that fails still leaves the
 * reasoning and steps behind.
 */
export const runTriage = async (marketDomain: string): Promise<TriageOutcome> => {
  const runLog = await createAgentRunLog(AGENT_NAME);

  // --------------------------------------------------
  // Read the day
  // --------------------------------------------------

  const day: ObservationDay = await fetchObservationsForDate(TRIAGE_DATE, marketDomain);

  const { rows, date } = day;

  await runLog.record("initializer", {
    date,

    marketDomain,

    model: modelIdOf(modelPick),

    maxOutputTokens: MAX_OUTPUT_TOKENS,

    reasoningEffort: REASONING_EFFORT,

    rowCount: rows.length,

    requestedDate: TRIAGE_DATE ?? "CURRENT_DATE",

    // How many rows were already promoted when this run started, so a repeat run
    // is distinguishable from one that did the work.
    alreadyEnabled: rows.filter((row) => row.research_enabled).length,
  });

  // Nothing to ask about. Recorded and returned rather than calling the model with
  // an empty list, which would return a ranking of nothing at full cost.
  if (rows.length === 0) {
    await runLog.record("triage_skipped", {
      reason: `No observations recorded for ${date} in ${marketDomain}.`,
    });

    const recordFile = await writeTriageRecord({
      date,
      marketDomain,
      rows,
      ranking: { rankOrder: [], decisions: [] },
      unknownIds: [],
      missingIds: [],
      promoted: 0,
      finishReason: null,
      recordSection: "triage_skipped",
    });

    await runLog.finish();

    return {
      date,
      marketDomain,
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
  
  Every observation below belongs to ${marketDomain}. Rank them against each other within this domain, and judge importance by what matters in ${marketDomain} specifically. A signal that would be routine in one domain may be material in this one.
  
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
      name: "triage_rankings",
      description:
        "Every input observation, ranked most important first, each flagged for whether it is worth research.",
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

  let ranking: TriageRanking;

  try {
    // `output` is the schema-validated result and is preferred whenever the
    // provider honoured structured output. `finalText` is the fallback, and is
    // still what gets recorded, so a run that only worked because of the fallback
    // is visible in the log rather than looking identical to one that used the
    // schema.
    const structured = result.output as TriageSchema | undefined;

    if (structured) {
      await runLog.record("parse_source", "output (schema-validated)");

      ranking = {
        rankOrder: structured.rankings.map((entry) => entry.id),
        decisions: structured.rankings.map((entry) => ({
          id: entry.id,
          important: entry.important,
          reason: entry.reason,
        })),
      };
    } else {
      await runLog.record(
        "parse_source",
        "text (fallback: provider returned no structured output)",
      );

      ranking = parseTriageRanking(finalText);
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

  for (const id of ranking.rankOrder) {
    if (!knownIds.has(id)) {
      if (!unknownIds.includes(id)) unknownIds.push(id);

      continue;
    }

    if (seen.has(id)) {
      if (!duplicateIds.includes(id)) duplicateIds.push(id);

      continue;
    }

    seen.add(id);
  }

  const missingIds = rows.map((row) => row.id).filter((id) => !seen.has(id));

  const importantIds = ranking.decisions
    .filter((decision) => decision.important && seen.has(decision.id))
    .map((decision) => decision.id);

  await runLog.record("decisions", {
    ranked: ranking.rankOrder.length,

    important: importantIds.length,

    // Reported rather than corrected: a response that lost or invented rows is a
    // fact about the run worth seeing next to the rankings themselves.
    unknownIds,

    duplicateIds,

    missingIds,

    rankings: ranking.decisions,
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
    rows,
    ranking,
    unknownIds,
    missingIds,
    promoted,
    finishReason,
  });

  return {
    date,
    marketDomain,
    considered: rows.length,
    promoted,
    importantIds,
    unknownIds,
    missingIds,
    recordFile,
  };
};

/**
 * The model's identifier, for the run log.
 *
 * Read through a narrow cast rather than widening the shared `models` type:
 * `modelId` is declared on the concrete model, not the LanguageModel alias.
 */
const modelIdOf = (model: unknown): string => {
  const id = (model as { modelId?: unknown }).modelId;

  return typeof id === "string" ? id : "unknown";
};

// --------------------------------------------------
// Dated record
// --------------------------------------------------

type TriageRecordInput = {
  date: string;
  marketDomain: string;
  rows: ObservationDay["rows"];
  ranking: TriageRanking;
  unknownIds: string[];
  missingIds: string[];
  promoted: number;
  finishReason: string | null;
  /** Run-log section describing what happened, echoed into the record. */
  recordSection?: string;
};

/**
 * Writes `AI/data/database Fetcher/triage/triage-<date>-<domain>.json`.
 *
 * One file per date and domain, overwritten rather than accumulated. The date is
 * in the name so it says which day it covered, and the domain is in the name
 * because the domains are triaged separately and one verdict says nothing about
 * another. An earlier verdict is recoverable from the run log.
 *
 * The domain goes through `toPathSegment` because `market_domain` is free text in
 * the database, not an identifier, so it is not guaranteed to be a legal file
 * name.
 *
 * Resolves to the path written, relative to the repository root.
 */
const writeTriageRecord = async (record: TriageRecordInput): Promise<string> => {
  const directory = path.join(AGENT_RUN_LOG_DIR, TRIAGE_RECORD_DIR);

  await fs.mkdir(directory, { recursive: true });

  const fileName = `triage-${record.date}-${toPathSegment(record.marketDomain)}.json`;

  const filePath = path.join(directory, fileName);

  const relativeFile = path.relative(process.cwd(), filePath).split(path.sep).join("/");

  const importantIds = record.ranking.decisions
    .filter((decision) => decision.important)
    .map((decision) => decision.id);

  const document = {
    date: record.date,

    marketDomain: record.marketDomain,

    writtenAt: new Date().toISOString(),

    recordSection: record.recordSection ?? "triage",

    finishReason: record.finishReason,

    considered: record.rows.length,

    promoted: record.promoted,

    importantIds,

    unknownIds: record.unknownIds,

    missingIds: record.missingIds,

    rankings: record.ranking.decisions,

    // The rows as they were read, so the record shows the input as well as the
    // verdict. `observation` is the text triage judged.
    rows: record.rows,
  };

  await fs.writeFile(filePath, toReadableJson(document), "utf8");

  return relativeFile;
};

// --------------------------------------------------
// Entry point
// --------------------------------------------------

/**
 * Domain triaged when this file is run directly.
 *
 * A direct run has to name one: triage is per domain by design, so there is no
 * sensible default and guessing one would silently rank the wrong set. Change
 * this to triage another domain by hand, or call `runTriage` from the pipeline
 * instead.
 */
const DIRECT_RUN_DOMAIN = "crypto";

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runTriage(DIRECT_RUN_DOMAIN)
    .then((outcome) => {
      console.log(
        `${outcome.date} ${outcome.marketDomain}: considered ${outcome.considered}, ` +
          `promoted ${outcome.promoted}. Record -> ${outcome.recordFile}`,
      );
    })
    .catch((error: unknown) => {
      console.error("Triage failed:", error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
