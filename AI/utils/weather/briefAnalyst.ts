import { z } from "zod";

import {
  AGENT_RUN_LOG_DIR,
  createAgentRunLog,
  createSilentAgentRunLog,
  type AgentRunLog,
} from "../logger.js";

import { extractJsonObject } from "./observations.js";

// --------------------------------------------------
// Brief Analyst
// --------------------------------------------------
//
// The brief's data contract: what the analyst and formatter are working toward,
// and the switch that controls whether either writes to disk.
//
// ## The shape is provisional
//
// These early runs exist to see what the model actually produces before the
// structure is fixed. So the inner items are `looseObject` with a handful of
// optional known fields: the formatter is nudged toward a shape, but nothing it
// was not asked to remove is stripped. Fields the model invents survive into the
// artifact, which is the whole point - they are the evidence for what the real
// schema should be.
//
// Tighten the inner objects once the runs have shown what is stable. Do that
// before anything reads these fields programmatically, because a schema that
// changes shape between runs makes two artifacts incomparable.
// --------------------------------------------------

// --------------------------------------------------
// Artifacts
// --------------------------------------------------

/** This agent's name. Names the run-log folder and file. */
export const AGENT_NAME = "Weather Brief Analyst";

/**
 * Whether the Brief Analyst keeps its JSON run log.
 *
 * Set this to `false` and nothing is written to AI/data: no run log under
 * `Weather Brief Analyst/`. Nothing else changes - there is no database write yet,
 * so this is purely the diagnostic artifact.
 *
 * Comment the line out to disable it.
 *
 * Left `true` because the run log is currently the *only* output. The analyst's
 * reasoning, its tool calls, its raw analysis and the formatter's normalized brief
 * all live here, and nothing is persisted anywhere else until the table is built.
 */
export const BRIEF_ARTIFACTS = true;

/**
 * The Brief Analyst's run log, or a no-op stand-in when artifacts are off.
 *
 * Returns the same type either way, so no agent code changes shape when the
 * switch flips.
 *
 * Both phases are recorded into this one file. The analyst's raw analysis and the
 * formatter's normalized brief are two views of the same run, and keeping them
 * together means a brief can be read next to the reasoning that produced it.
 */
export const createBriefAnalystRunLog = async (): Promise<AgentRunLog> => {
  return BRIEF_ARTIFACTS
    ? await createAgentRunLog(AGENT_NAME)
    : createSilentAgentRunLog(AGENT_NAME);
};

/** Where the run log lives, for the agent's header comment. */
export const BRIEF_RUN_LOG_DIR = AGENT_RUN_LOG_DIR;

// --------------------------------------------------
// The brief
// --------------------------------------------------

/**
 * One development, metric, trend, catalyst or uncertainty.
 *
 * Every field is optional and the object is loose, so the formatter normalizes
 * toward these names without being forced to invent content for a field the
 * analyst never produced - which its own instructions forbid.
 */
const briefItem = z.looseObject({
  // Shared across several item kinds: a human label, and the records it came from.
  title: z.string().optional(),
  name: z.string().optional(),

  // Present wherever there is prose worth carrying.
  summary: z.string().optional(),
  description: z.string().optional(),
  significance: z.string().optional(),
  interpretation: z.string().optional(),

  // Metrics.
  indicator: z.string().optional(),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
  unit: z.string().optional(),
  observationDate: z.string().optional(),
  comparison: z.string().optional(),

  // Catalysts: what is scheduled, and how firmly.
  event: z.string().optional(),
  date: z.string().optional(),
  dateCertainty: z.string().optional(),

  // How the evidence should be read.
  status: z.string().optional(),
  category: z.string().optional(),

  // Traceability. Preserved exactly as supplied; never invented.
  evidenceRefs: z.array(z.string()).optional(),
  sourceRefs: z.array(z.string()).optional(),
  observationRefs: z.array(z.string()).optional(),
  indicatorRefs: z.array(z.string()).optional(),
});

/**
 * The brief's structure.
 *
 * The ten top-level fields come straight from the analyst's required response
 * structure and are enforced: a brief that is missing `assessment` is not a brief.
 * Everything beneath them stays open.
 *
 * Collections are arrays even when empty, and unavailable scalars are `null`, as
 * the analyst's instructions require - so a consumer never has to distinguish
 * "none found" from "not looked at".
 */
export const briefSchema = z.object({
  domain: z.string(),
  intelligenceSetId: z.string(),
  intelligenceDate: z.string(),

  assessment: z.string(),

  keyDevelopments: z.array(briefItem),
  significantMetrics: z.array(briefItem),
  trendsAndTensions: z.array(briefItem),
  upcomingCatalysts: z.array(briefItem),
  uncertaintiesAndDataQuality: z.array(briefItem),
  coverageNotes: z.array(briefItem),
});

export type DomainBrief = z.infer<typeof briefSchema>;

/**
 * The schema as JSON Schema, for the formatter prompt.
 *
 * The formatter is told the exact structure to normalize into, and this is that
 * structure rendered the way a prompt can carry it. Generated from `briefSchema`
 * rather than written out separately, so the prompt can never describe a different
 * schema from the one the result is validated against - which is the failure that
 * produced a `signals` array when the prompt asked for `rankings`.
 */
export const briefJsonSchema = (): string => {
  return JSON.stringify(z.toJSONSchema(briefSchema), null, 2);
};

/**
 * Pulls the analyst's JSON out of its response.
 *
 * Lenient by design: the analyst runs with tools and therefore cannot be given a
 * schema (see the Groq tools-plus-JSON-mode restriction), so its output is parsed
 * rather than validated. Its job here is only to confirm the response contains
 * something object-shaped; deciding whether the brief is *good* is the formatter's
 * job, and judging the content is a human's.
 *
 * Throws on nothing usable, so an empty or prose-only reply is visible rather than
 * silently formatted into an empty brief.
 */
export const parseAnalystBrief = (analystText: string): Record<string, unknown> => {
  const received = (text: string): string => {
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;

    return `${text.length} characters: ${JSON.stringify(preview)}`;
  };

  const json = extractJsonObject(analystText);

  if (json === null) {
    throw new Error(`Analyst response contained no JSON object. Received ${received(analystText)}`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Analyst response was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Received ${received(analystText)}`,
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Analyst response was not a JSON object. Received ${received(analystText)}`);
  }

  return parsed as Record<string, unknown>;
};

/**
 * Normalizes the formatter's response into a brief.
 *
 * The schema enforces the ten top-level fields and the collection types; the loose
 * inner objects mean a formatter that reorganized or extended an item is not
 * punished for it, which matters while the shape is still being decided.
 *
 * Throws rather than returning a partial, so a brief that fails validation never
 * reaches a caller as though it were complete. The formatter's raw response is in
 * the run log either way.
 */
export const parseBriefResult = (formatterText: string): DomainBrief => {
  const received = (text: string): string => {
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;

    return `${text.length} characters: ${JSON.stringify(preview)}`;
  };

  const json = extractJsonObject(formatterText);

  if (json === null) {
    throw new Error(
      `Formatter response contained no JSON object. Received ${received(formatterText)}`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Formatter response was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Received ${received(formatterText)}`,
    );
  }

  const result = briefSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(
      `Formatter response did not match the brief schema. ${received(formatterText)}. ` +
        `Issues: ${result.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")}`,
    );
  }

  return result.data;
};
