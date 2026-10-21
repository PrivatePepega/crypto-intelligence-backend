import pool from "../../../config/database.js";

import { END, Send } from "@langchain/langgraph";

import type {
  WriterDispatchState,
  WriterInput,
  WriterNodeInput,
  WriterOutput,
} from "../schemas/writer.schema.js";

import { runWriterAgent } from "../agents/writer.agent.js";
import { injectWriterOutput } from "../../utils/climate/databaseInjectors.js";

import { macroMarketRegimeAgentBrief } from "../prompts/analyst section instructions/02 — Macro & Market Regime.js";
import { sectorConditionsWorkingInstructions } from "../prompts/analyst section instructions/03 — Sector Conditions.js";
import { importantStoriesNarrativesAgentInstructionManual } from "../prompts/analyst section instructions/04 — Important Stories & Narratives.js";
import { trendsAndCapitalDirectionAgentInstructionBrief } from "../prompts/analyst section instructions/05 — Trends & Capital Direction.js";
import { outlookRisksAndUncertaintiesAgentInstructionManual } from "../prompts/analyst section instructions/06 — Outlook, Risks & Uncertainties.js";

// --------------------------------------------------
// Writer loader
// --------------------------------------------------
//
// Builds one writing job per section/domain cell of the climate brief:
//
//   previousSectionDomainBrief — yesterday's `<column>_data` cell
//   analystNotes               — today's `<column>_analysis` cell
//
// The writer produces today's complete brief and writes it back into today's
// `<column>_data` cell.
//
// Section 01 (Global Overview) is intentionally excluded: it has its own graph.
// Section 02 (Macro & Market Regime) has a single merged cell with no domain
// suffix, so it produces one target rather than six.
// --------------------------------------------------

export type WriterLoadJobsState = {
  yesterdayIntelligenceSetId: string;
  climateIntelligenceSetId: string;
};

/**
 * One writer target: the section/domain it covers and the exact
 * climate.climate_briefs `_data` column it is anchored to.
 */
type WriterJobTarget = {
  sectionName: string;
  domainName: string;
  /** The `_data` column. `_analysis` derives from it and the brief is written back to it. */
  column: string;
  sectionInstructions: string;
};

/**
 * Every writer target, matching database/sql/climate/climateBrief.sql
 * (sections 02-06 only). 1 merged macro target + 24 sector/domain targets.
 */
export const WRITER_JOB_TARGETS: readonly WriterJobTarget[] = [
  // 02. Macro & Market Regime
  {
    sectionName: "Macro & Market Regime",
    domainName: "all_domains",
    column: "macro_market_regime_data",
    sectionInstructions: macroMarketRegimeAgentBrief,
  },

  // 03. Sector Conditions
  {
    sectionName: "Sector Conditions",
    domainName: "geopolitics",
    column: "sector_conditions_geopolitics_data",
    sectionInstructions: sectorConditionsWorkingInstructions,
  },
  {
    sectionName: "Sector Conditions",
    domainName: "financial_markets",
    column: "sector_conditions_financial_markets_data",
    sectionInstructions: sectorConditionsWorkingInstructions,
  },
  {
    sectionName: "Sector Conditions",
    domainName: "macro",
    column: "sector_conditions_macro_data",
    sectionInstructions: sectorConditionsWorkingInstructions,
  },
  {
    sectionName: "Sector Conditions",
    domainName: "commodities_energy",
    column: "sector_conditions_commodities_energy_data",
    sectionInstructions: sectorConditionsWorkingInstructions,
  },
  {
    sectionName: "Sector Conditions",
    domainName: "crypto",
    column: "sector_conditions_crypto_data",
    sectionInstructions: sectorConditionsWorkingInstructions,
  },
  {
    sectionName: "Sector Conditions",
    domainName: "ai_technology_industry",
    column: "sector_conditions_ai_technology_industry_data",
    sectionInstructions: sectorConditionsWorkingInstructions,
  },

  // 04. Important Stories & Narratives
  {
    sectionName: "Important Stories & Narratives",
    domainName: "geopolitics",
    column: "important_stories_narratives_geopolitics_data",
    sectionInstructions: importantStoriesNarrativesAgentInstructionManual,
  },
  {
    sectionName: "Important Stories & Narratives",
    domainName: "financial_markets",
    column: "important_stories_narratives_financial_markets_data",
    sectionInstructions: importantStoriesNarrativesAgentInstructionManual,
  },
  {
    sectionName: "Important Stories & Narratives",
    domainName: "macro",
    column: "important_stories_narratives_macro_data",
    sectionInstructions: importantStoriesNarrativesAgentInstructionManual,
  },
  {
    sectionName: "Important Stories & Narratives",
    domainName: "commodities_energy",
    column: "important_stories_narratives_commodities_energy_data",
    sectionInstructions: importantStoriesNarrativesAgentInstructionManual,
  },
  {
    sectionName: "Important Stories & Narratives",
    domainName: "crypto",
    column: "important_stories_narratives_crypto_data",
    sectionInstructions: importantStoriesNarrativesAgentInstructionManual,
  },
  {
    sectionName: "Important Stories & Narratives",
    domainName: "ai_technology_industry",
    column: "important_stories_narratives_ai_technology_industry_data",
    sectionInstructions: importantStoriesNarrativesAgentInstructionManual,
  },

  // 05. Trends & Capital Direction
  {
    sectionName: "Trends & Capital Direction",
    domainName: "geopolitics",
    column: "trends_capital_direction_geopolitics_data",
    sectionInstructions: trendsAndCapitalDirectionAgentInstructionBrief,
  },
  {
    sectionName: "Trends & Capital Direction",
    domainName: "financial_markets",
    column: "trends_capital_direction_financial_markets_data",
    sectionInstructions: trendsAndCapitalDirectionAgentInstructionBrief,
  },
  {
    sectionName: "Trends & Capital Direction",
    domainName: "macro",
    column: "trends_capital_direction_macro_data",
    sectionInstructions: trendsAndCapitalDirectionAgentInstructionBrief,
  },
  {
    sectionName: "Trends & Capital Direction",
    domainName: "commodities_energy",
    column: "trends_capital_direction_commodities_energy_data",
    sectionInstructions: trendsAndCapitalDirectionAgentInstructionBrief,
  },
  {
    sectionName: "Trends & Capital Direction",
    domainName: "crypto",
    column: "trends_capital_direction_crypto_data",
    sectionInstructions: trendsAndCapitalDirectionAgentInstructionBrief,
  },
  {
    sectionName: "Trends & Capital Direction",
    domainName: "ai_technology_industry",
    column: "trends_capital_direction_ai_technology_industry_data",
    sectionInstructions: trendsAndCapitalDirectionAgentInstructionBrief,
  },

  // 06. Outlook, Risks & Uncertainties
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "geopolitics",
    column: "outlook_risks_uncertainties_geopolitics_data",
    sectionInstructions: outlookRisksAndUncertaintiesAgentInstructionManual,
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "financial_markets",
    column: "outlook_risks_uncertainties_financial_markets_data",
    sectionInstructions: outlookRisksAndUncertaintiesAgentInstructionManual,
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "macro",
    column: "outlook_risks_uncertainties_macro_data",
    sectionInstructions: outlookRisksAndUncertaintiesAgentInstructionManual,
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "commodities_energy",
    column: "outlook_risks_uncertainties_commodities_energy_data",
    sectionInstructions: outlookRisksAndUncertaintiesAgentInstructionManual,
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "crypto",
    column: "outlook_risks_uncertainties_crypto_data",
    sectionInstructions: outlookRisksAndUncertaintiesAgentInstructionManual,
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "ai_technology_industry",
    column: "outlook_risks_uncertainties_ai_technology_industry_data",
    sectionInstructions: outlookRisksAndUncertaintiesAgentInstructionManual,
  },
];

const DATA_SUFFIX = "_data";

/** Builds the `_analysis` column from its `_data` column. */
function analysisColumn(column: string): string {
  return `${column.slice(0, -DATA_SUFFIX.length)}_analysis`;
}

/**
 * Normalizes a JSONB `_data` cell into prompt text.
 *
 * The initializer stores each `_data` cell as a JSON string scalar, so
 * node-postgres returns a plain string. Objects are stringified with indentation
 * for readability.
 */
function toBriefText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value, null, 2).trim();
}

/**
 * Normalizes today's `_analysis` cell.
 *
 * Analysis cells accumulate an array of analyst runs. jsonb comes back already
 * parsed; a JSON string is parsed when possible.
 */
function toAnalystNotes(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  return value;
}

/** True when the analyst notes have nothing for the writer to use. */
function isEmptyNotes(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;

  return false;
}

export async function writerLoadJobsNode(state: WriterLoadJobsState) {
  const { yesterdayIntelligenceSetId, climateIntelligenceSetId } = state;

  // Column lists come from the trusted constant target list, never from input.
  const dataColumns = WRITER_JOB_TARGETS.map((target) => target.column).join(", ");
  const analysisColumns = WRITER_JOB_TARGETS.map((target) => analysisColumn(target.column)).join(
    ", ",
  );

  const [yesterdayResult, todayResult] = await Promise.all([
    pool.query<Record<string, unknown>>(
      `
        SELECT ${dataColumns}
        FROM climate.climate_briefs
        WHERE intelligence_sets_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [yesterdayIntelligenceSetId],
    ),
    pool.query<Record<string, unknown>>(
      `
        SELECT ${analysisColumns}
        FROM climate.climate_briefs
        WHERE intelligence_sets_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [climateIntelligenceSetId],
    ),
  ]);

  const yesterdayBrief = yesterdayResult.rows[0];
  const todayBrief = todayResult.rows[0];

  if (!yesterdayBrief) {
    throw new Error(
      `No climate brief found for yesterday's intelligence set ${yesterdayIntelligenceSetId}.`,
    );
  }

  if (!todayBrief) {
    throw new Error(`No climate brief found for intelligence set ${climateIntelligenceSetId}.`);
  }

  const jobs: WriterInput[] = [];
  const skipped = {
    noBaseline: [] as string[],
    emptyNotes: 0,
  };

  for (const target of WRITER_JOB_TARGETS) {
    const previousSectionDomainBrief = toBriefText(yesterdayBrief[target.column]);

    // Without a previous brief there is no template to continue.
    if (previousSectionDomainBrief.length === 0) {
      skipped.noBaseline.push(`${target.sectionName}/${target.domainName}`);
      continue;
    }

    const analystNotes = toAnalystNotes(todayBrief[analysisColumn(target.column)]);

    // Without analyst notes there is nothing to write today.
    if (isEmptyNotes(analystNotes)) {
      skipped.emptyNotes += 1;
      continue;
    }

    jobs.push({
      sectionName: target.sectionName,
      domainName: target.domainName,
      sectionInstructions: target.sectionInstructions,
      previousSectionDomainBrief,
      analystNotes,
      column: target.column,
    });
  }

  console.log(
    `[Writer] Loaded ${jobs.length} jobs from ${WRITER_JOB_TARGETS.length} targets ` +
      `(baseline: yesterday ${yesterdayIntelligenceSetId}, notes: today ${climateIntelligenceSetId})`,
  );

  if (skipped.noBaseline.length > 0 || skipped.emptyNotes > 0) {
    console.warn(
      `[Writer] Skipped ${skipped.noBaseline.length + skipped.emptyNotes} jobs ` +
        `(no baseline: ${skipped.noBaseline.length}, empty analysis: ${skipped.emptyNotes})`,
    );
  }

  if (skipped.noBaseline.length > 0) {
    console.warn(`[Writer] Targets without baseline: ${skipped.noBaseline.join(", ")}`);
  }

  return { jobs };
}

/**
 * Runs the writer agent for one section/domain job and writes the resulting
 * brief into today's `_data` cell for that section/domain.
 *
 * A failure is logged and returned as an empty brief rather than thrown, so one
 * failing section does not abort the rest of the graph. The full error is
 * preserved in the agent's run log.
 */
export async function writerNode(state: WriterNodeInput) {
  const { sectionName, domainName, column } = state.job;

  console.log(`[Writer] INITIALIZED | Section: ${sectionName} | Domain: ${domainName}`);

  try {
    const result = await runWriterAgent(state.job);

    await injectWriterOutput(state.climateIntelligenceSetId, state.job, result);

    console.log(
      `[Writer] FINALIZED | Section: ${sectionName} | Domain: ${domainName} | ` +
        `Brief: ${result.brief.length} chars`,
    );

    return {
      results: [
        {
          sectionName,
          domainName,
          column,
          result,
        },
      ],
    };
  } catch (error) {
    console.error(`[Writer] FAILED | Section: ${sectionName} | Domain: ${domainName}`);

    if (error instanceof Error) {
      console.error(`  ${error.name}: ${error.message.slice(0, 200)}`);
    }

    // Non-fatal: keep the graph running and report the failure in the results.
    const result: WriterOutput = { brief: "" };

    return {
      results: [
        {
          sectionName,
          domainName,
          column,
          result,
        },
      ],
    };
  }
}

/**
 * Fans out one writer node invocation per loaded job.
 *
 * Both intelligence set IDs are forwarded to every job: the previous brief comes
 * from `yesterdayIntelligenceSetId` (already embedded in the job), the analyst
 * notes and the new brief belong to `climateIntelligenceSetId`.
 */
export function writerDispatch(state: WriterDispatchState) {
  if (state.jobs.length === 0) {
    return END;
  }

  return state.jobs.map(
    (job) =>
      new Send("writer", {
        yesterdayIntelligenceSetId: state.yesterdayIntelligenceSetId,
        climateIntelligenceSetId: state.climateIntelligenceSetId,
        job,
      }),
  );
}
