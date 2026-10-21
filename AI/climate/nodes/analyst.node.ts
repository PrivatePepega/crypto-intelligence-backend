import pool from "../../../config/database.js";

import { END, Send } from "@langchain/langgraph";

import type {
  AnalystDispatchState,
  AnalystInput,
  AnalystNodeInput,
  AnalystOutput,
} from "../schemas/analyst.schema.js";

import { runAnalystAgent } from "../agents/analyst.agent.js";
import { injectAnalystOutput } from "../../utils/climate/databaseInjectors.js";

import { macroMarketRegimeAgentBrief } from "../prompts/analyst section instructions/02 — Macro & Market Regime.js";
import { sectorConditionsWorkingInstructions } from "../prompts/analyst section instructions/03 — Sector Conditions.js";
import { importantStoriesNarrativesAgentInstructionManual } from "../prompts/analyst section instructions/04 — Important Stories & Narratives.js";
import { trendsAndCapitalDirectionAgentInstructionBrief } from "../prompts/analyst section instructions/05 — Trends & Capital Direction.js";
import { outlookRisksAndUncertaintiesAgentInstructionManual } from "../prompts/analyst section instructions/06 — Outlook, Risks & Uncertainties.js";

// --------------------------------------------------
// Analyst loader
// --------------------------------------------------
//
// Builds two analysis jobs per section/domain cell of the climate brief:
//
//   1. weather_observation — today's `_relevance_router` cell
//   2. climate_research    — today's `_researcher` cell
//
// Each job's baseline (`currentSectionDomainBrief`) is yesterday's `_data` cell,
// and its output is appended to today's `_analysis` cell.
//
// Section 01 (Global Overview) is intentionally excluded: it has its own graph.
// Section 02 (Macro & Market Regime) has a single merged cell with no domain
// suffix, so it produces one target rather than six.
// --------------------------------------------------

export type AnalystLoadJobsState = {
  yesterdayIntelligenceSetId: string;
  climateIntelligenceSetId: string;
};

/**
 * One analyst target: the section/domain it covers and the exact
 * climate.climate_briefs `_data` column it is anchored to.
 */
type AnalystJobTarget = {
  sectionName: string;
  domainName: string;
  /** The `_data` column. `_relevance_router`, `_researcher`, `_analysis` derive from it. */
  column: string;
  sectionInstructions: string;
};

/**
 * Every analyst target, matching database/sql/climate/climateBrief.sql
 * (sections 02-06 only). 1 merged macro target + 24 sector/domain targets.
 */
export const ANALYST_JOB_TARGETS: readonly AnalystJobTarget[] = [
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

/** The two incoming sources every target is analyzed against. */
const INCOMING_SOURCES = [
  { dataType: "weather_observation", stage: "relevance_router" },
  { dataType: "climate_research", stage: "researcher" },
] as const;

/** Builds a stage column from its `_data` column: `<prefix>_data` -> `<prefix>_<stage>`. */
function stageColumn(column: string, stage: "relevance_router" | "researcher"): string {
  return `${column.slice(0, -DATA_SUFFIX.length)}_${stage}`;
}

/**
 * Normalizes a JSONB cell into prompt text.
 *
 * The initializer stores each `_data` cell as a JSON string, so node-postgres
 * returns a plain string. Later stages may write objects, which are stringified
 * with indentation for readability.
 */
function toBriefText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value, null, 2).trim();
}

/**
 * Normalizes an incoming `_relevance_router` / `_researcher` cell.
 *
 * jsonb objects come back already parsed; a JSON string (for example from an
 * older initializer-style write) is parsed when possible.
 */
function toIncomingData(value: unknown): unknown {
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

/** True when an incoming cell has nothing to analyze. */
function isEmptyIncoming(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;

  if (Array.isArray(value)) return value.length === 0;

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);

    if (keys.length === 0) return true;

    // `{ relevantObservations: [] }` and `{ findings: [] }` carry no work.
    if (keys.length === 1) {
      const only = record[keys[0]!];
      if (Array.isArray(only)) return only.length === 0;
    }

    return false;
  }

  return false;
}

export async function analystLoadJobsNode(state: AnalystLoadJobsState) {
  const { yesterdayIntelligenceSetId, climateIntelligenceSetId } = state;

  // Column lists come from the trusted constant target list, never from input.
  const dataColumns = ANALYST_JOB_TARGETS.map((target) => target.column).join(", ");
  const relevanceColumns = ANALYST_JOB_TARGETS.map((target) =>
    stageColumn(target.column, "relevance_router"),
  ).join(", ");
  const researcherColumns = ANALYST_JOB_TARGETS.map((target) =>
    stageColumn(target.column, "researcher"),
  ).join(", ");

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
        SELECT ${relevanceColumns}, ${researcherColumns}
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

  const jobs: AnalystInput[] = [];
  const skipped = {
    noBaseline: [] as string[],
    weatherObservation: 0,
    climateResearch: 0,
  };

  for (const target of ANALYST_JOB_TARGETS) {
    const label = `${target.sectionName}/${target.domainName}`;
    const currentSectionDomainBrief = toBriefText(yesterdayBrief[target.column]);

    // Without a baseline there is nothing to analyze against.
    if (currentSectionDomainBrief.length === 0) {
      skipped.noBaseline.push(label);
      continue;
    }

    for (const source of INCOMING_SOURCES) {
      const incomingData = toIncomingData(todayBrief[stageColumn(target.column, source.stage)]);

      if (isEmptyIncoming(incomingData)) {
        if (source.dataType === "weather_observation") {
          skipped.weatherObservation += 1;
        } else {
          skipped.climateResearch += 1;
        }
        continue;
      }

      jobs.push({
        sectionName: target.sectionName,
        domainName: target.domainName,
        sectionInstructions: target.sectionInstructions,
        currentSectionDomainBrief,
        column: target.column,
        incomingDataType: source.dataType,
        incomingData,
      });
    }
  }

  console.log(
    `[Analyst] Loaded ${jobs.length} jobs from ${ANALYST_JOB_TARGETS.length} targets ` +
      `(baseline: yesterday ${yesterdayIntelligenceSetId}, incoming: today ${climateIntelligenceSetId})`,
  );

  const skippedEmpty = skipped.weatherObservation + skipped.climateResearch;

  if (skipped.noBaseline.length > 0 || skippedEmpty > 0) {
    console.warn(
      `[Analyst] Skipped ${skipped.noBaseline.length + skippedEmpty} jobs ` +
        `(no baseline: ${skipped.noBaseline.length}, ` +
        `empty relevance_router: ${skipped.weatherObservation}, ` +
        `empty researcher: ${skipped.climateResearch})`,
    );
  }

  if (skipped.noBaseline.length > 0) {
    console.warn(`[Analyst] Targets without baseline: ${skipped.noBaseline.join(", ")}`);
  }

  return { jobs };
}

/**
 * Runs the analyst agent for one section/domain job and appends its decisions to
 * that section/domain's `_analysis` cell.
 *
 * A failure is logged and returned as an empty decision set rather than thrown,
 * so one failing analysis does not abort the rest of the graph. The full error is
 * preserved in the agent's run log.
 */
export async function analystNode(state: AnalystNodeInput) {
  const { sectionName, domainName, column, incomingDataType } = state.job;

  console.log(
    `[Analyst] INITIALIZED | Section: ${sectionName} | Domain: ${domainName} | Incoming: ${incomingDataType}`,
  );

  try {
    const result = await runAnalystAgent(state.job);

    await injectAnalystOutput(state.climateIntelligenceSetId, state.job, result);

    console.log(
      `[Analyst] FINALIZED | Section: ${sectionName} | Domain: ${domainName} | ` +
        `Incoming: ${incomingDataType} | Decisions: ${result.decisions.length}`,
    );

    return {
      results: [
        {
          sectionName,
          domainName,
          column,
          incomingDataType,
          result,
        },
      ],
    };
  } catch (error) {
    console.error(
      `[Analyst] FAILED | Section: ${sectionName} | Domain: ${domainName} | Incoming: ${incomingDataType}`,
    );

    if (error instanceof Error) {
      console.error(`  ${error.name}: ${error.message.slice(0, 200)}`);
    }

    // Non-fatal: keep the graph running and report the failure in the results.
    const result: AnalystOutput = { decisions: [], summary: "" };

    return {
      results: [
        {
          sectionName,
          domainName,
          column,
          incomingDataType,
          result,
        },
      ],
    };
  }
}

/**
 * Fans out one analyst node invocation per loaded job.
 *
 * Both intelligence set IDs are forwarded to every job: the baseline brief comes
 * from `yesterdayIntelligenceSetId` (already embedded in the job) and the
 * analysis is written into `climateIntelligenceSetId`.
 */
export function analystDispatch(state: AnalystDispatchState) {
  if (state.jobs.length === 0) {
    return END;
  }

  return state.jobs.map(
    (job) =>
      new Send("analyst", {
        yesterdayIntelligenceSetId: state.yesterdayIntelligenceSetId,
        climateIntelligenceSetId: state.climateIntelligenceSetId,
        job,
      }),
  );
}
