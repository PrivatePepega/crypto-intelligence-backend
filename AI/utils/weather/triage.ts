import { z } from "zod";

import fs from "node:fs/promises";
import path from "node:path";

import {
  AGENT_RUN_LOG_DIR,
  agentRunFileName,
  createAgentRunLog,
  createSilentAgentRunLog,
  toPathSegment,
  toReadableJson,
  type AgentRunLog,
} from "../logger.js";

import { extractJsonObject } from "./observations.js";

import type { ObservationDay } from "./dbFetcher.triage.js";

// --------------------------------------------------
// Triage
// --------------------------------------------------
//
// Triage's data contract and its artifacts, kept out of the agent that produces
// them. The agent file holds prompts, the model call and orchestration; this file
// holds what the agent's output means and how it is written down.
//
// Mirrors observations.ts for the Observer: the shape of a decision, how to read
// one out of a model response, and where the result is stored.
// --------------------------------------------------

// --------------------------------------------------
// Model response
// --------------------------------------------------

/**
 * One observation's label.
 *
 * A decision, not a rank: `important` is the whole verdict. Triage produces no
 * order, no score and no position, because nothing downstream consumes one.
 */
export type TriageDecision = {
  /** The observation's row id, copied from the input. */
  id: string;
  /** Whether this observation is a signal worth spending research on. */
  important: boolean;
  /** One sentence on why, for the run log and the dated record. */
  reason: string;
};

/**
 * The shape the agent must return.
 *
 * Enforced by the SDK through structured output rather than asked for in prose.
 * Run 002 returned a well-formed array of decisions under a key of its own
 * choosing, and a prompt instruction did not prevent it: the prose describing the
 * job named it, and the model followed the prose. A model picking its own key name
 * for data the pipeline then reads by key is a failure waiting to happen, so the
 * schema is the contract and the prompt only carries the judgement.
 *
 * One entry per observation, in no meaningful order. Triage labels each
 * observation independently, so the array is a set of labels rather than a ranked
 * list, and nothing here reads its position.
 *
 * Every field is required because structured output is validated against the
 * schema rather than parsed afterwards, so there is no point tolerating a missing
 * `reason`: an empty string carries the same meaning and one less code path.
 */
export const triageSchema = z.object({
  signals: z.array(
    z.object({
      id: z.string().min(1),
      important: z.boolean(),
      reason: z.string(),
    }),
  ),
});

export type TriageSchema = z.infer<typeof triageSchema>;

/**
 * Turns the agent's response into one label per observation.
 *
 * Returns a flat list because that is all triage produces: a decision per
 * observation. There is deliberately no ordering, no rank and no score, because
 * nothing downstream consumes one.
 *
 * Only needed when the provider did not honour structured output. The caller
 * prefers the SDK's schema-validated `output` and falls back to this; both paths
 * are recorded in the run log so a fallback run is never mistaken for a schema
 * run.
 *
 * Throws rather than returning an empty list, so an unusable response fails the
 * run loudly instead of quietly promoting nothing. The raw text is in the run log
 * either way.
 *
 * Entries missing an `id` or `important` are dropped rather than guessed at, and
 * the caller is told how many, so a partially malformed response is visible
 * instead of silently promoting a subset.
 */
export const parseTriageResult = (finalText: string): TriageDecision[] => {
  const received = (text: string): string => {
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;

    return `${text.length} characters: ${JSON.stringify(preview)}`;
  };

  const json = extractJsonObject(finalText);

  if (json === null) {
    throw new Error(`Triage response contained no JSON object. Received ${received(finalText)}`);
  }

  let parsed: { signals?: unknown };

  try {
    parsed = JSON.parse(json) as { signals?: unknown };
  } catch (error) {
    throw new Error(
      `Triage response was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Received ${received(finalText)}`,
    );
  }

  if (!Array.isArray(parsed.signals)) {
    throw new Error(`Triage response had no "signals" array. Received ${received(finalText)}`);
  }

  const decisions: TriageDecision[] = [];

  for (const entry of parsed.signals) {
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

  // Response order is preserved rather than sorted, but it carries no meaning:
  // it is whatever order the model happened to emit, and nothing reads its
  // position.
  return decisions;
};

// --------------------------------------------------
// Artifacts
// --------------------------------------------------
//
// Everything Triage writes into AI/data/, in one place.
//
// The database write is the product and is not here: flipping
// `research_enabled` to true happens regardless of this switch. What this
// controls is the JSON on disk - the run log and the dated record - which exists
// to be read while building the pipeline and is dead weight in production.
//
// One switch. See TRIAGE_ARTIFACTS.
// --------------------------------------------------

/** This agent's name. Names the run-log folder and file. */
export const AGENT_NAME = "Weather Triage";

/**
 * Whether Triage keeps its JSON artifacts.
 *
 * Set this to `false` and Triage stops writing to AI/data entirely: no run log
 * under `Weather Triage/`, no record under `database Fetcher/triage/`. It still
 * promotes observations and still prints its console lines, because neither is a
 * file artifact.
 *
 * Comment the line out to disable it.
 *
 * Left `true` because the record is the only place the model's reasoning is kept
 * after the fact: which observations it called important, and why.
 */
export const TRIAGE_ARTIFACTS = true;

/**
 * Triage's run log, or a no-op stand-in when artifacts are off.
 *
 * Returns the same type either way, so no agent code changes shape when the
 * switch flips.
 */
export const createTriageRunLog = async (marketDomain: string): Promise<AgentRunLog> => {
  return TRIAGE_ARTIFACTS
    ? await createAgentRunLog(AGENT_NAME, marketDomain)
    : createSilentAgentRunLog(AGENT_NAME, marketDomain);
};

// --------------------------------------------------
// Dated record
// --------------------------------------------------

/** Where the dated triage records are written, relative to AI/data. */
const TRIAGE_RECORD_DIR = path.join("database Fetcher", "weather", "triage");

export type TriageRecord = {
  date: string;
  marketDomain: string;
  /**
   * The intelligence set this verdict covers.
   *
   * Recorded at the top level so the artifact states which day's work it belongs
   * to without having to infer it from the file name or dig through every row. The
   * rows carry it too, but only as one field among several per observation.
   */
  intelligenceSetId: string;
  rows: ObservationDay["rows"];
  /** One label per observation, in no meaningful order. */
  decisions: TriageDecision[];
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
export const writeTriageRecord = async (record: TriageRecord): Promise<string> => {
  const directory = path.join(AGENT_RUN_LOG_DIR, TRIAGE_RECORD_DIR);

  await fs.mkdir(directory, { recursive: true });

  const fileName = `triage-${record.date}-${toPathSegment(record.marketDomain)}.json`;

  const filePath = path.join(directory, fileName);

  const relativeFile = path.relative(process.cwd(), filePath).split(path.sep).join("/");

  const importantIds = record.decisions
    .filter((decision) => decision.important)
    .map((decision) => decision.id);

  const document = {
    date: record.date,

    marketDomain: record.marketDomain,

    // The set this verdict covers, and the one every row below belongs to. Both
    // are recorded so a reader can confirm the artifact matches a set without
    // querying the database.
    intelligenceSetId: record.intelligenceSetId,

    setIdAgreesWithEveryRow: record.rows.every(
      (row) => row.intelligence_set_id === record.intelligenceSetId,
    ),

    writtenAt: new Date().toISOString(),

    recordSection: record.recordSection ?? "triage",

    finishReason: record.finishReason,

    considered: record.rows.length,

    promoted: record.promoted,

    importantIds,

    unknownIds: record.unknownIds,

    missingIds: record.missingIds,

    // One label per observation, with no rank or order. The array order is whatever
    // order the model emitted and carries no meaning.
    decisions: record.decisions,

    // The rows as they were read, so the record shows the input as well as the
    // verdict. `observation` is the text triage judged.
    rows: record.rows,
  };

  await fs.writeFile(filePath, toReadableJson(document), "utf8");

  return relativeFile;
};
