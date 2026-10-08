import { z } from "zod";

import fs from "node:fs/promises";
import path from "node:path";

import { AGENT_RUN_LOG_DIR, toPathSegment, toReadableJson } from "../logger.js";

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

// --------------------------------------------------
// Database dump
// --------------------------------------------------

/** Where the research dump is written, relative to AI/data. */
const RESEARCH_DUMP_DIR = path.join("database Fetcher", "researcher");

export type ResearchDump = {
  date: string;
  marketDomain: string;
  intelligenceSetId: string;
  rows: StoredResearch[];
};

/**
 * Writes `AI/data/database Fetcher/researcher/research-<date>-<domain>.json`.
 *
 * Written after the research loop, from a read of weather.research rather than
 * from the values the loop held in memory. That matters: the dump is then a
 * record of what actually landed in the database, so a row the insert rejected
 * shows up as missing here instead of being reported as researched.
 *
 * One file per date and domain, overwritten rather than accumulated, matching the
 * triage record.
 *
 * Resolves to the path written, relative to the repository root.
 */
export const writeResearchDump = async (dump: ResearchDump): Promise<string> => {
  const directory = path.join(AGENT_RUN_LOG_DIR, RESEARCH_DUMP_DIR);

  await fs.mkdir(directory, { recursive: true });

  const fileName = `research-${dump.date}-${toPathSegment(dump.marketDomain)}.json`;

  const filePath = path.join(directory, fileName);

  const relativeFile = path.relative(process.cwd(), filePath).split(path.sep).join("/");

  const document = {
    date: dump.date,

    marketDomain: dump.marketDomain,

    intelligenceSetId: dump.intelligenceSetId,

    writtenAt: new Date().toISOString(),

    rowCount: dump.rows.length,

    rows: dump.rows,
  };

  await fs.writeFile(filePath, toReadableJson(document), "utf8");

  return relativeFile;
};
