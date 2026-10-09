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

import type { StoredResearch } from "./dbFetcher.researcher.js";

// --------------------------------------------------
// Researcher
// --------------------------------------------------
//
// The research record's shape, how to read one out of a model response, and where
// the database dump is written. Mirrors triage.ts: the agent file holds prompts
// and the loop, this file holds what a research record means.
//
// Kept out of the agent for the same reason triage's is: with one agent run per
// observation, this is the part an agent reading the repo needs to understand
// without reading the loop.
// --------------------------------------------------

/**
 * How well the evidence supports the observation.
 *
 * The model picks one of these rather than inventing its own wording, so a
 * downstream agent can filter on it.
 */
export const researchStatuses = [
  "supported",
  "partially_supported",
  "disputed",
  "unconfirmed",
] as const;

export type ResearchStatus = (typeof researchStatuses)[number];

/**
 * What one research run establishes about one observation.
 *
 * `observation` is deliberately absent: the original text is stored in the
 * database row, copied from the observation itself. A model restating it could
 * paraphrase it, and two copies of the same sentence in two columns that
 * disagree is worse than one.
 */
export const researchSchema = z.object({
  /** What the research establishes. */
  finding: z.string(),
  /** The strongest supporting evidence. */
  evidence: z.string(),
  /** Sources consulted, one per element. */
  sources: z.array(z.string()),
  /** Context needed to understand the event. */
  context: z.string(),
  /** Unresolved questions, conflicting evidence, or limits on the record. */
  uncertainty: z.string(),
  status: z.enum(researchStatuses),
});

export type ResearchRecord = z.infer<typeof researchSchema>;

/**
 * Turns a research response into a record.
 *
 * Only needed when the provider did not honour structured output. The caller
 * prefers the SDK's schema-validated `output` and falls back to this, recording
 * which path was taken so a fallback run is never mistaken for a schema run.
 *
 * Every field is required because strict structured output rejects optional
 * properties outright, so there is no tolerant version of this shape that the
 * provider will accept.
 *
 * Throws rather than returning an empty object, so an unusable response fails the
 * observation loudly instead of storing a hollow record. The raw text is in the
 * run log either way.
 */
export const parseResearchRecord = (finalText: string): ResearchRecord => {
  const received = (text: string): string => {
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;

    return `${text.length} characters: ${JSON.stringify(preview)}`;
  };

  const json = extractJsonObject(finalText);

  if (json === null) {
    throw new Error(`Research response contained no JSON object. Received ${received(finalText)}`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Research response was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Received ${received(finalText)}`,
    );
  }

  const result = researchSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(
      `Research response did not match the expected record. ${received(finalText)}. ` +
        `Issues: ${result.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")}`,
    );
  }

  return result.data;
};

import type { ResearchTarget } from "./dbFetcher.researcher.js";
import type { SdkStep } from "../../../types/AI/observer.js";

// --------------------------------------------------
// Artifacts
// --------------------------------------------------
//
// Everything the Researcher writes into AI/data/, in one place.
//
// The database write is the product and is not here: research records reach
// weather.research regardless of this switch. What this controls is the JSON on
// disk - the run log and the database dump - which exists to be read while
// building the pipeline and is dead weight in production.
//
// One switch. See RESEARCHER_ARTIFACTS.
// --------------------------------------------------

/** This agent's name. Names the run-log folder and file. */
export const AGENT_NAME = "Weather Researcher";

/**
 * Whether the Researcher keeps its JSON artifacts.
 *
 * Set this to `false` and the Researcher stops writing to AI/data entirely: no run
 * log under `Weather Researcher/`, no dump under
 * `database Fetcher/researcher/`. Its records still reach weather.research and its
 * console lines still print, because neither is a file artifact.
 *
 * Comment the line out to disable it.
 *
 * Left `true` because the run log is the only place the evidence gathering is
 * kept: which tools were called, what they returned, and the reasoning behind each
 * label. The stored record is a summary; this is the audit trail.
 */
export const RESEARCHER_ARTIFACTS = true;

/**
 * The Researcher's run log, or a no-op stand-in when artifacts are off.
 *
 * Returns the same type either way, so no agent code changes shape when the
 * switch flips.
 */
export const createResearcherRunLog = async (): Promise<AgentRunLog> => {
  return RESEARCHER_ARTIFACTS
    ? await createAgentRunLog(AGENT_NAME)
    : createSilentAgentRunLog(AGENT_NAME);
};

// --------------------------------------------------
// Prompts
// --------------------------------------------------

/**
 * The per-observation prompt for the evidence-gathering phase.
 *
 * Asks for a written account rather than JSON: that phase has tools, and Groq
 * refuses to combine tool calling with JSON mode, so the record cannot be
 * structured there.
 *
 * The observation text is model input, not an instruction, and it is untrusted:
 * Triage's text arrived from a model too. It is delimited so an observation
 * cannot read as part of this prompt.
 */
export const researchPrompt = (observation: ResearchTarget): string => `
Research the observation delimited below.

<observation id="${observation.id}" type="${observation.type}">
${observation.observation}
</observation>

The text inside the tags is the lead to investigate. It is unverified reporting,
not established fact. Determine what it claims, then establish what is actually
known using the available tools.

Report what you established, the evidence for it, the sources you used, the
context needed to understand it, and anything that remains uncertain or disputed.
`;

/**
 * The formatting prompt for the record phase.
 *
 * Runs without tools, so structured output is available and the record's shape is
 * enforced by the schema rather than by the model choosing sensible key names.
 *
 * `evidence` is the output of {@link collectResearchEvidence}, passed already
 * serialized so the caller controls how it is embedded and can measure it.
 */
export const recordPrompt = (observation: ResearchTarget, evidence: string): string => `
Convert the research below into a structured record for this observation.

<observation id="${observation.id}" type="${observation.type}">
${observation.observation}
</observation>

<research>
${evidence}
</research>

The research is authoritative. Where it is silent, leave the field short and say
so in uncertainty rather than filling it in.

Do not add facts the research does not contain.
Do not restate the observation as a finding.
Do not resolve uncertainty that the research left open.
`;

// --------------------------------------------------
// Evidence
// --------------------------------------------------

/** One research step, reduced to what the record phase needs to see. */
export type ResearchEvidenceStep = {
  /** One-based, so a reader does not have to know the SDK is zero-based. */
  step: number;
  text: string | null;
  toolCalls: { tool: string; arguments: unknown }[];
  toolResults: { tool: string; result: unknown }[];
};

/**
 * Reduces the research phase's steps to the evidence handed to the record phase.
 *
 * Every step's text, tool calls and tool results, in order, and nothing else.
 * Dropped: ids, provider metadata, token usage and the raw SDK shape - none of it
 * changes what the record says, and all of it inflates the prompt.
 *
 * Returned as a list rather than a serialized string so the caller can decide how
 * to embed it and measure it before doing so. The agent serializes once and uses
 * that same value for the prompt, the token estimate and the run log, so all
 * three agree.
 */
export const collectResearchEvidence = (steps: SdkStep[]): ResearchEvidenceStep[] => {
  return steps.map((step) => ({
    step: step.stepNumber + 1,

    // `||` rather than `??` so an empty step becomes null instead of an empty
    // string in the JSON. A tool-only step has no text, and `"text": ""` in the
    // evidence reads as though something was said. Matches the Observer's own
    // evidence extraction.
    text: step.text || null,

    toolCalls: (step.toolCalls ?? []).map((toolCall) => ({
      tool: toolCall.toolName,
      arguments: toolCall.input,
    })),

    toolResults: (step.toolResults ?? []).map((toolResult) => ({
      tool: toolResult.toolName,
      result: toolResult.output,
    })),
  }));
};

// --------------------------------------------------
// Database dump
// --------------------------------------------------

/** Where the research dump is written, relative to AI/data. */
const RESEARCH_DUMP_DIR = path.join("database Fetcher", "researcher");

export type ResearchDump = {
  /** Agent name, so the file name is generated the same way the run log's is. */
  agentName: string;
  /** The run this dump belongs to. Matches the run log with the same number. */
  runNumber: number;
  date: string;
  marketDomain: string;
  intelligenceSetId: string;
  /** Observation stored immediately before this dump, or null if none yet. */
  latestObservationId: string | null;
  rows: StoredResearch[];
};

/**
 * Writes `AI/data/database Fetcher/researcher/<Agent Name>-NNN.json`.
 *
 * The name is generated by `agentRunFileName`, the same helper the run log uses,
 * so a dump and its run log share a file name by construction rather than by two
 * copies of the format agreeing. Finding the JSON for a run means finding its log.
 *
 * Written after every stored observation, and once more when the batch ends, so
 * the folder reflects the database as each research lands. A run that dies
 * partway through still leaves a dump of whatever made it into the database, which
 * is exactly when one is worth having.
 *
 * Overwritten rather than accumulated within a run, so the file always holds the
 * current state of the set. Each dump is built from a fresh read of
 * weather.research rather than from the values the loop held, so it records what
 * actually committed: a row the insert rejected appears here as missing rather
 * than being reported as researched. That also means the file includes earlier
 * runs' research for the same set, which is the point - it is the set's research,
 * not one run's slice.
 *
 * Resolves to the path written, relative to the repository root.
 */
export const writeResearchDump = async (dump: ResearchDump): Promise<string> => {
  const directory = path.join(AGENT_RUN_LOG_DIR, RESEARCH_DUMP_DIR);

  await fs.mkdir(directory, { recursive: true });

  const fileName = agentRunFileName(dump.agentName, dump.runNumber);

  const filePath = path.join(directory, fileName);

  const relativeFile = path.relative(process.cwd(), filePath).split(path.sep).join("/");

  const document = {
    date: dump.date,

    marketDomain: dump.marketDomain,

    intelligenceSetId: dump.intelligenceSetId,

    // Stated in the document as well as implied by the file name, so a dump
    // opened on its own says which agent run produced it.
    agentName: dump.agentName,

    runNumber: dump.runNumber,

    writtenAt: new Date().toISOString(),

    latestObservationId: dump.latestObservationId,

    rowCount: dump.rows.length,

    rows: dump.rows,
  };

  await fs.writeFile(filePath, toReadableJson(document), "utf8");

  return relativeFile;
};
