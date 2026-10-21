import pool from "../../../config/database.js";

import { END, Send } from "@langchain/langgraph";

import type {
  ResearcherDispatchState,
  ResearcherInput,
} from "../schemas/researcher.schema.js";

// --------------------------------------------------
// Researcher loader
// --------------------------------------------------
//
// Builds one research job per section/domain `_data` cell of the previous day's
// climate brief. Each job receives only its own cell's content, so the agent
// researches one section/domain at a time instead of the whole brief at once.
//
// The previous day's brief is identified by `yesterdayIntelligenceSetId`, not by
// date, so a re-run or backfill always reads the same source set.
//
// Sections 01 (Global Overview) and 02 (Macro & Market Regime) have a single
// merged column with no domain suffix; sections 03-06 have one column per domain.
// --------------------------------------------------

export type ResearcherLoadJobsState = {
  yesterdayIntelligenceSetId: string;
};

/**
 * One research target: the section/domain a job covers and the exact
 * climate.climate_briefs column it reads.
 */
type ResearcherJobTarget = {
  /** Section name, shared with the relevance router naming. */
  sectionName: string;
  /** Domain label passed to the agent. */
  domainName: string;
  /** The `_data` column in climate.climate_briefs. */
  column: string;
};

/**
 * Every section/domain `_data` cell in climate.climate_briefs.
 *
 * Keep this list in sync with database/sql/climate/climateBrief.sql.
 * 01 and 02 have a single merged cell; 03-06 have six per section.
 */
export const RESEARCHER_JOB_TARGETS: readonly ResearcherJobTarget[] = [
  // 01. Global Overview
  {
    sectionName: "Global Overview",
    domainName: "global",
    column: "global_overview_data",
  },

  // 02. Macro & Market Regime
  {
    sectionName: "Macro & Market Regime",
    domainName: "all_domains",
    column: "macro_market_regime_data",
  },

  // 03. Sector Conditions
  {
    sectionName: "Sector Conditions",
    domainName: "geopolitics",
    column: "sector_conditions_geopolitics_data",
  },
  {
    sectionName: "Sector Conditions",
    domainName: "financial_markets",
    column: "sector_conditions_financial_markets_data",
  },
  {
    sectionName: "Sector Conditions",
    domainName: "macro",
    column: "sector_conditions_macro_data",
  },
  {
    sectionName: "Sector Conditions",
    domainName: "commodities_energy",
    column: "sector_conditions_commodities_energy_data",
  },
  {
    sectionName: "Sector Conditions",
    domainName: "crypto",
    column: "sector_conditions_crypto_data",
  },
  {
    sectionName: "Sector Conditions",
    domainName: "ai_technology_industry",
    column: "sector_conditions_ai_technology_industry_data",
  },

  // 04. Important Stories & Narratives
  {
    sectionName: "Important Stories & Narratives",
    domainName: "geopolitics",
    column: "important_stories_narratives_geopolitics_data",
  },
  {
    sectionName: "Important Stories & Narratives",
    domainName: "financial_markets",
    column: "important_stories_narratives_financial_markets_data",
  },
  {
    sectionName: "Important Stories & Narratives",
    domainName: "macro",
    column: "important_stories_narratives_macro_data",
  },
  {
    sectionName: "Important Stories & Narratives",
    domainName: "commodities_energy",
    column: "important_stories_narratives_commodities_energy_data",
  },
  {
    sectionName: "Important Stories & Narratives",
    domainName: "crypto",
    column: "important_stories_narratives_crypto_data",
  },
  {
    sectionName: "Important Stories & Narratives",
    domainName: "ai_technology_industry",
    column: "important_stories_narratives_ai_technology_industry_data",
  },

  // 05. Trends & Capital Direction
  {
    sectionName: "Trends & Capital Direction",
    domainName: "geopolitics",
    column: "trends_capital_direction_geopolitics_data",
  },
  {
    sectionName: "Trends & Capital Direction",
    domainName: "financial_markets",
    column: "trends_capital_direction_financial_markets_data",
  },
  {
    sectionName: "Trends & Capital Direction",
    domainName: "macro",
    column: "trends_capital_direction_macro_data",
  },
  {
    sectionName: "Trends & Capital Direction",
    domainName: "commodities_energy",
    column: "trends_capital_direction_commodities_energy_data",
  },
  {
    sectionName: "Trends & Capital Direction",
    domainName: "crypto",
    column: "trends_capital_direction_crypto_data",
  },
  {
    sectionName: "Trends & Capital Direction",
    domainName: "ai_technology_industry",
    column: "trends_capital_direction_ai_technology_industry_data",
  },

  // 06. Outlook, Risks & Uncertainties
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "geopolitics",
    column: "outlook_risks_uncertainties_geopolitics_data",
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "financial_markets",
    column: "outlook_risks_uncertainties_financial_markets_data",
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "macro",
    column: "outlook_risks_uncertainties_macro_data",
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "commodities_energy",
    column: "outlook_risks_uncertainties_commodities_energy_data",
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "crypto",
    column: "outlook_risks_uncertainties_crypto_data",
  },
  {
    sectionName: "Outlook, Risks & Uncertainties",
    domainName: "ai_technology_industry",
    column: "outlook_risks_uncertainties_ai_technology_industry_data",
  },
];

/**
 * Normalizes a JSONB cell into prompt text.
 *
 * The initializer stores each `_data` cell as a JSON string, so node-postgres
 * returns a plain string. Later stages may write objects or arrays, which are
 * stringified with indentation for readability.
 */
function toBriefText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value, null, 2).trim();
}

export async function researcherLoadJobsNode(state: ResearcherLoadJobsState) {
  const { yesterdayIntelligenceSetId } = state;

  // Select every `_data` cell in one round trip. Column names come from the
  // trusted constant list above, never from user input.
  const columns = RESEARCHER_JOB_TARGETS.map((target) => target.column).join(", ");

  const { rows } = await pool.query<Record<string, unknown>>(
    `
      SELECT ${columns}
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [yesterdayIntelligenceSetId],
  );

  const brief = rows[0];

  if (!brief) {
    throw new Error(
      `No climate brief found for yesterday's intelligence set ${yesterdayIntelligenceSetId}.`,
    );
  }

  const jobs: ResearcherInput[] = [];
  const skipped: string[] = [];

  for (const target of RESEARCHER_JOB_TARGETS) {
    const climateDomainBrief = toBriefText(brief[target.column]);

    // Nothing to research if yesterday's cell is empty.
    if (climateDomainBrief.length === 0) {
      skipped.push(`${target.sectionName}/${target.domainName} (${target.column} empty)`);
      continue;
    }

    jobs.push({
      sectionName: target.sectionName,
      domainName: target.domainName,
      column: target.column,
      climateDomainBrief,
    });
  }

  console.log(
    `[Researcher] Loaded ${jobs.length}/${RESEARCHER_JOB_TARGETS.length} section/domain briefs ` +
      `from yesterday's intelligence set ${yesterdayIntelligenceSetId}`,
  );

  if (skipped.length > 0) {
    console.warn(`[Researcher] Skipped empty cells: ${skipped.join(", ")}`);
  }

  return { jobs };
}

/**
 * Fans out one researcher node invocation per loaded job.
 *
 * Both intelligence set IDs are forwarded to every job: the agent reads the
 * source brief from `yesterdayIntelligenceSetId` (already embedded in the job)
 * and the finished research is written into `climateIntelligenceSetId`.
 */
export function researcherDispatch(state: ResearcherDispatchState) {
  if (state.jobs.length === 0) {
    return END;
  }

  return state.jobs.map(
    (job) =>
      new Send("researcher", {
        yesterdayIntelligenceSetId: state.yesterdayIntelligenceSetId,
        climateIntelligenceSetId: state.climateIntelligenceSetId,
        job,
      }),
  );
}
