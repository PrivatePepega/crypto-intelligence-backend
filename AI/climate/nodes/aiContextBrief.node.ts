import pool from "../../../config/database.js";

import { END, Send } from "@langchain/langgraph";

import type {
  AIContextBriefDispatchState,
  AIContextBriefInput,
  AIContextBriefNodeInput,
  AIContextBriefOutput,
} from "../schemas/aiContextBrief.schema.js";

import { runAIContextBriefAgent } from "../agents/aiContextBrief.agent.js";
import { injectAIContextBriefOutput } from "../../utils/climate/databaseInjectors.js";

import { RESEARCHER_JOB_TARGETS } from "./researcher.node.js";

// --------------------------------------------------
// AI Context Brief loader
// --------------------------------------------------
//
// Builds one job per compressed section (02-06). Section 01 (Global Overview) is
// carried forward unchanged from the previous brief instead of being synthesized.
//
// Data comes from today's climate intelligence set, because the context brief is
// derived from the brief that was written today.
//
// Section 02 (Macro & Market Regime) has a single merged cell; sections 03-06
// have six domain cells that are joined here.
// --------------------------------------------------

export type AIContextBriefLoadJobsState = {
  climateIntelligenceSetId: string;
};

/**
 * One AI context brief target: the section to synthesize and the JSONB column
 * its finished brief is written to.
 */
type AIContextBriefSectionTarget = {
  sectionName: string;
  /** The `ai_context_brief_*` JSONB column in climate.climate_briefs. */
  aiContextBriefColumn: string;
};

/**
 * Every section that has an AI context brief column, matching
 * database/sql/climate/climateBrief.sql.
 *
 * The `_data` columns for each section are taken from RESEARCHER_JOB_TARGETS so
 * the source list stays in one place.
 */
export const AI_CONTEXT_BRIEF_SECTION_TARGETS: readonly AIContextBriefSectionTarget[] = [
  {
    sectionName: "Macro & Market Regime",
    aiContextBriefColumn: "ai_context_brief_macro_market_regime",
  },
  {
    sectionName: "Sector Conditions",
    aiContextBriefColumn: "ai_context_brief_sector_conditions",
  },
  {
    sectionName: "Important Stories & Narratives",
    aiContextBriefColumn: "ai_context_brief_important_stories_narratives",
  },
  {
    sectionName: "Trends & Capital Direction",
    aiContextBriefColumn: "ai_context_brief_trends_capital_direction",
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    aiContextBriefColumn: "ai_context_brief_outlook_risks_uncertainties",
  },
];

/** Separator placed between the section's domain documents. */
const SECTION_DATA_SEPARATOR = "\n\n---\n\n";

/**
 * Normalizes a JSONB cell into prompt text.
 *
 * `_data` cells are jsonb string scalars, so node-postgres returns a plain
 * string. Objects and arrays are stringified with indentation for readability.
 */
function toBriefText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value, null, 2).trim();
}

export async function aiContextBriefLoadJobsNode(state: AIContextBriefLoadJobsState) {
  const { climateIntelligenceSetId } = state;

  // Select every `_data` cell in one round trip. Column names come from the
  // trusted constant list in researcher.node.ts, never from user input.
  const columns = RESEARCHER_JOB_TARGETS.map((target) => target.column).join(", ");

  const { rows } = await pool.query<Record<string, unknown>>(
    `
      SELECT ${columns}
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [climateIntelligenceSetId],
  );

  const brief = rows[0];

  if (!brief) {
    throw new Error(`No climate brief found for intelligence set ${climateIntelligenceSetId}.`);
  }

  const jobs: AIContextBriefInput[] = [];
  const skipped: string[] = [];

  for (const section of AI_CONTEXT_BRIEF_SECTION_TARGETS) {
    const sectionTargets = RESEARCHER_JOB_TARGETS.filter(
      (target) => target.sectionName === section.sectionName,
    );

    const parts = sectionTargets
      .map((target) => toBriefText(brief[target.column]))
      .filter((text) => text.length > 0);

    // Without any populated domain cells there is nothing to compress.
    if (parts.length === 0) {
      skipped.push(`${section.sectionName} (no populated data cells)`);
      continue;
    }

    jobs.push({
      sectionName: section.sectionName,
      sectionData: parts.join(SECTION_DATA_SEPARATOR),
      aiContextBriefColumn: section.aiContextBriefColumn,
    });
  }

  console.log(
    `[AI Context Brief] Loaded ${jobs.length}/${AI_CONTEXT_BRIEF_SECTION_TARGETS.length} sections ` +
      `from today's intelligence set ${climateIntelligenceSetId}`,
  );

  if (skipped.length > 0) {
    console.warn(`[AI Context Brief] Skipped sections: ${skipped.join(", ")}`);
  }

  return { jobs };
}

/**
 * Runs the AI context brief agent for one section and writes the finished
 * structured brief into that section's `ai_context_brief_*` column.
 *
 * A failure is logged and returned as an empty brief rather than thrown, so one
 * failing section does not abort the rest of the graph. The full error is
 * preserved in the agent's run log.
 */
export async function aiContextBriefNode(state: AIContextBriefNodeInput) {
  const { sectionName, aiContextBriefColumn } = state.job;

  console.log(`[AI Context Brief] INITIALIZED | Section: ${sectionName}`);

  try {
    const result = await runAIContextBriefAgent(state.job);

    await injectAIContextBriefOutput(state.climateIntelligenceSetId, aiContextBriefColumn, result);

    console.log(
      `[AI Context Brief] FINALIZED | Section: ${sectionName} | ` +
        `Domains: ${result.domains.length} | Overview: ${result.overview.length} chars`,
    );

    return {
      results: [
        {
          sectionName,
          aiContextBriefColumn,
          result,
        },
      ],
    };
  } catch (error) {
    console.error(`[AI Context Brief] FAILED | Section: ${sectionName}`);

    if (error instanceof Error) {
      console.error(`  ${error.name}: ${error.message.slice(0, 200)}`);
    }

    // Non-fatal: keep the graph running and report the failure in the results.
    const result: AIContextBriefOutput = {
      sectionName,
      overview: "",
      domains: [],
    };

    return {
      results: [
        {
          sectionName,
          aiContextBriefColumn,
          result,
        },
      ],
    };
  }
}

/**
 * Fans out one AI context brief node invocation per loaded section.
 *
 * Only today's intelligence set ID is forwarded: the section data is already
 * embedded in the job and the finished brief is written into the same set.
 */
export function aiContextBriefDispatch(state: AIContextBriefDispatchState) {
  if (state.jobs.length === 0) {
    return END;
  }

  return state.jobs.map(
    (job) =>
      new Send("aiContextBrief", {
        climateIntelligenceSetId: state.climateIntelligenceSetId,
        job,
      }),
  );
}
