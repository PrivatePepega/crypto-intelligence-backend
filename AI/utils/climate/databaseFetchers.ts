import pool from "../../../config/database.js";

import type { DailySet } from "../weather/observations.js";

// --------------------------------------------------
// Climate Brief Analyst
// --------------------------------------------------
//
// The read half of the climate brief against climate.climate_briefs.
//
// Unlike weather.daily_briefs, which stores one brief per domain, climate.climate_briefs
// stores one row per intelligence set with a column for each section and domain.
// This module exposes typed readers for each of those columns.
//
// The table constrains what can be stored:
//
// - **One row per intelligence set and date.** The table has no unique constraint on
//   (intelligence_sets_id, date) beyond the primary key, so duplicates are possible.
//   All reads here scope by intelligence_sets_id for consistency with the weather
//   fetchers.
// - **All payload columns are JSONB.** They may be null when not yet populated.
// - **The columns are organized by section and domain:** each of sections 03-06 has
//   four columns per domain (_data, _relevance_router, _researcher, _analysis).
//   Section 01 has two columns (researcher, analysis). Section 02 has four columns
//   without a domain suffix (geopolitics only in the initializer).
// --------------------------------------------------

/** The domains stored in climate.climate_briefs, matching the column names. */
export type ClimateDomain =
  | "geopolitics"
  | "financial_markets"
  | "macro"
  | "commodities_energy"
  | "crypto"
  | "ai_technology_industry";

/** The four analysis stages stored per section/domain. */
export type ClimateStage = "data" | "relevance_router" | "researcher" | "analysis";

/** The six sections of the climate brief. */
export type ClimateSection =
  | "global_overview"
  | "macro_market_regime"
  | "sector_conditions"
  | "important_stories_narratives"
  | "trends_capital_direction"
  | "outlook_risks_uncertainties";

/** One climate brief row as stored. */
export type StoredClimateBrief = {
  uuid: string;
  intelligence_sets_id: string;
  date: string;
  created_at: string;
  [key: string]: unknown;
};

// --------------------------------------------------
// Column name helpers
// --------------------------------------------------

/** Builds a column name from section, domain, and stage. */
const columnName = (
  section: ClimateSection,
  domain: ClimateDomain | null,
  stage: ClimateStage,
): string => {
  const sectionPrefix = section.replace(/_/g, "_");
  if (section === "global_overview") {
    return `global_overview_${stage}`;
  }
  if (section === "macro_market_regime") {
    return `macro_market_regime_${stage}`;
  }
  if (domain === null) {
    throw new Error(`Domain is required for section ${section}`);
  }
  return `${section}_${domain}_${stage}`;
};

// --------------------------------------------------
// Generic fetchers
// --------------------------------------------------

/**
 * Fetches a specific climate brief section for a given domain and stage.
 *
 * @param intelligenceSet The intelligence set to scope by.
 * @param section The section to fetch (e.g., "sector_conditions").
 * @param domain The domain to fetch (e.g., "geopolitics"), or null for global_overview/macro_market_regime.
 * @param stage The analysis stage to fetch (data, relevance_router, researcher, analysis).
 * @returns The JSONB value, or null if not found.
 */
export const fetchClimateBriefSection = async (
  intelligenceSet: DailySet,
  section: ClimateSection,
  domain: ClimateDomain | null,
  stage: ClimateStage,
): Promise<unknown | null> => {
  const col = columnName(section, domain, stage);

  const { rows } = await pool.query(
    `
      SELECT ${col}
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  if (rows.length === 0) return null;

  return rows[0][col] ?? null;
};

/**
 * Fetches all four stages (data, relevance_router, researcher, analysis) for a
 * given section and domain.
 *
 * @param intelligenceSet The intelligence set to scope by.
 * @param section The section to fetch.
 * @param domain The domain to fetch, or null for global_overview/macro_market_regime.
 * @returns An object with all four stages, or null if not found.
 */
export const fetchClimateBriefSectionAllStages = async (
  intelligenceSet: DailySet,
  section: ClimateSection,
  domain: ClimateDomain | null,
): Promise<Record<ClimateStage, unknown> | null> => {
  const stages: ClimateStage[] = ["data", "relevance_router", "researcher", "analysis"];
  const cols = stages.map((s) => columnName(section, domain, s)).join(", ");

  const { rows } = await pool.query(
    `
      SELECT ${cols}
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  if (rows.length === 0) return null;

  const result: Record<ClimateStage, unknown> = {} as Record<ClimateStage, unknown>;
  for (const stage of stages) {
    const col = columnName(section, domain, stage);
    result[stage] = rows[0][col] ?? null;
  }

  return result;
};

/**
 * Fetches the entire climate brief for an intelligence set.
 *
 * @param intelligenceSet The intelligence set to scope by.
 * @returns The full climate brief row, or null if not found.
 */
export const fetchClimateBrief = async (
  intelligenceSet: DailySet,
): Promise<StoredClimateBrief | null> => {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return (rows[0] as StoredClimateBrief) ?? null;
};

// --------------------------------------------------
// 01 - Global Overview
// --------------------------------------------------

/** Fetches the global overview data. */
export const fetchClimateBriefGlobalOverviewData = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "global_overview", null, "data");
};

/** Fetches the global overview researcher data. */
export const fetchClimateBriefGlobalOverviewResearcher = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "global_overview", null, "researcher");
};

/** Fetches the global overview analysis. */
export const fetchClimateBriefGlobalOverviewAnalysis = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "global_overview", null, "analysis");
};

// --------------------------------------------------
// 02 - Macro & Market Regime
// --------------------------------------------------

/** Fetches the macro market regime data. */
export const fetchClimateBriefMacroMarketRegimeData = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "macro_market_regime", null, "data");
};

/** Fetches the macro market regime relevance router. */
export const fetchClimateBriefMacroMarketRegimeRelevanceRouter = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "macro_market_regime", null, "relevance_router");
};

/** Fetches the macro market regime researcher. */
export const fetchClimateBriefMacroMarketRegimeResearcher = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "macro_market_regime", null, "researcher");
};

/** Fetches the macro market regime analysis. */
export const fetchClimateBriefMacroMarketRegimeAnalysis = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "macro_market_regime", null, "analysis");
};

// --------------------------------------------------
// 03 - Sector Conditions
// --------------------------------------------------

/** Fetches the sector conditions data for a given domain. */
export const fetchClimateBriefSectorConditionsData = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "sector_conditions", domain, "data");
};

/** Fetches the sector conditions relevance router for a given domain. */
export const fetchClimateBriefSectorConditionsRelevanceRouter = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "sector_conditions", domain, "relevance_router");
};

/** Fetches the sector conditions researcher for a given domain. */
export const fetchClimateBriefSectorConditionsResearcher = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "sector_conditions", domain, "researcher");
};

/** Fetches the sector conditions analysis for a given domain. */
export const fetchClimateBriefSectorConditionsAnalysis = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "sector_conditions", domain, "analysis");
};

// --------------------------------------------------
// 04 - Important Stories & Narratives
// --------------------------------------------------

/** Fetches the important stories & narratives data for a given domain. */
export const fetchClimateBriefImportantStoriesNarrativesData = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "important_stories_narratives", domain, "data");
};

/** Fetches the important stories & narratives relevance router for a given domain. */
export const fetchClimateBriefImportantStoriesNarrativesRelevanceRouter = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(
    intelligenceSet,
    "important_stories_narratives",
    domain,
    "relevance_router",
  );
};

/** Fetches the important stories & narratives researcher for a given domain. */
export const fetchClimateBriefImportantStoriesNarrativesResearcher = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(
    intelligenceSet,
    "important_stories_narratives",
    domain,
    "researcher",
  );
};

/** Fetches the important stories & narratives analysis for a given domain. */
export const fetchClimateBriefImportantStoriesNarrativesAnalysis = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(
    intelligenceSet,
    "important_stories_narratives",
    domain,
    "analysis",
  );
};

// --------------------------------------------------
// 05 - Trends & Capital Direction
// --------------------------------------------------

/** Fetches the trends & capital direction data for a given domain. */
export const fetchClimateBriefTrendsCapitalDirectionData = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "trends_capital_direction", domain, "data");
};

/** Fetches the trends & capital direction relevance router for a given domain. */
export const fetchClimateBriefTrendsCapitalDirectionRelevanceRouter = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(
    intelligenceSet,
    "trends_capital_direction",
    domain,
    "relevance_router",
  );
};

/** Fetches the trends & capital direction researcher for a given domain. */
export const fetchClimateBriefTrendsCapitalDirectionResearcher = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(
    intelligenceSet,
    "trends_capital_direction",
    domain,
    "researcher",
  );
};

/** Fetches the trends & capital direction analysis for a given domain. */
export const fetchClimateBriefTrendsCapitalDirectionAnalysis = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(intelligenceSet, "trends_capital_direction", domain, "analysis");
};

// --------------------------------------------------
// 06 - Outlook, Risks & Uncertainties
// --------------------------------------------------

/** Fetches the outlook, risks & uncertainties data for a given domain. */
export const fetchClimateBriefOutlookRisksUncertaintiesData = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(
    intelligenceSet,
    "outlook_risks_uncertainties",
    domain,
    "analysis",
  );
};

/** Fetches the outlook, risks & uncertainties relevance router for a given domain. */
export const fetchClimateBriefOutlookRisksUncertaintiesRelevanceRouter = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(
    intelligenceSet,
    "outlook_risks_uncertainties",
    domain,
    "relevance_router",
  );
};

/** Fetches the outlook, risks & uncertainties researcher for a given domain. */
export const fetchClimateBriefOutlookRisksUncertaintiesResearcher = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(
    intelligenceSet,
    "outlook_risks_uncertainties",
    domain,
    "researcher",
  );
};

/** Fetches the outlook, risks & uncertainties analysis for a given domain. */
export const fetchClimateBriefOutlookRisksUncertaintiesAnalysis = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
): Promise<unknown | null> => {
  return fetchClimateBriefSection(
    intelligenceSet,
    "outlook_risks_uncertainties",
    domain,
    "analysis",
  );
};

// --------------------------------------------------
// Convenience: all stages for all domains in a section
// --------------------------------------------------

/**
 * Fetches all four stages for all six domains in a given section.
 *
 * Useful for building a complete brief or for debugging.
 *
 * @param intelligenceSet The intelligence set to scope by.
 * @param section The section to fetch.
 * @returns A map of domain -> { data, relevance_router, researcher, analysis }.
 */
export const fetchClimateBriefSectionAllDomains = async (
  intelligenceSet: DailySet,
  section: ClimateSection,
): Promise<Record<ClimateDomain, Record<ClimateStage, unknown> | null>> => {
  const result: Record<ClimateDomain, Record<ClimateStage, unknown> | null> = {} as Record<
    ClimateDomain,
    Record<ClimateStage, unknown> | null
  >;

  const domains: ClimateDomain[] = [
    "geopolitics",
    "financial_markets",
    "macro",
    "commodities_energy",
    "crypto",
    "ai_technology_industry",
  ];

  for (const domain of domains) {
    result[domain] = await fetchClimateBriefSectionAllStages(intelligenceSet, section, domain);
  }

  return result;
};

// --------------------------------------------------
// Human Brief and AI Context Brief
// --------------------------------------------------

/** Fetches the human brief global overview. */
export const fetchClimateBriefHumanBriefGlobalOverview = async (
  intelligenceSet: DailySet,
): Promise<string | null> => {
  const { rows } = await pool.query(
    `
      SELECT human_brief_global_overview
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.human_brief_global_overview ?? null;
};

/** Fetches the human brief macro market regime. */
export const fetchClimateBriefHumanBriefMacroMarketRegime = async (
  intelligenceSet: DailySet,
): Promise<string | null> => {
  const { rows } = await pool.query(
    `
      SELECT human_brief_macro_market_regime
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.human_brief_macro_market_regime ?? null;
};

/** Fetches the human brief sector conditions. */
export const fetchClimateBriefHumanBriefSectorConditions = async (
  intelligenceSet: DailySet,
): Promise<string | null> => {
  const { rows } = await pool.query(
    `
      SELECT human_brief_sector_conditions
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.human_brief_sector_conditions ?? null;
};

/** Fetches the human brief important stories & narratives. */
export const fetchClimateBriefHumanBriefImportantStoriesNarratives = async (
  intelligenceSet: DailySet,
): Promise<string | null> => {
  const { rows } = await pool.query(
    `
      SELECT human_brief_important_stories_narratives
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.human_brief_important_stories_narratives ?? null;
};

/** Fetches the human brief trends & capital direction. */
export const fetchClimateBriefHumanBriefTrendsCapitalDirection = async (
  intelligenceSet: DailySet,
): Promise<string | null> => {
  const { rows } = await pool.query(
    `
      SELECT human_brief_trends_capital_direction
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.human_brief_trends_capital_direction ?? null;
};

/** Fetches the human brief outlook, risks & uncertainties. */
export const fetchClimateBriefHumanBriefOutlookRisksUncertainties = async (
  intelligenceSet: DailySet,
): Promise<string | null> => {
  const { rows } = await pool.query(
    `
      SELECT human_brief_outlook_risks_uncertainties
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.human_brief_outlook_risks_uncertainties ?? null;
};

// --------------------------------------------------
// AI Context Brief
// --------------------------------------------------

/** Fetches the AI context brief global overview. */
export const fetchClimateBriefAiContextBriefGlobalOverview = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  const { rows } = await pool.query(
    `
      SELECT ai_context_brief_global_overview
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.ai_context_brief_global_overview ?? null;
};

/** Fetches the AI context brief macro market regime. */
export const fetchClimateBriefAiContextBriefMacroMarketRegime = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  const { rows } = await pool.query(
    `
      SELECT ai_context_brief_macro_market_regime
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.ai_context_brief_macro_market_regime ?? null;
};

/** Fetches the AI context brief sector conditions. */
export const fetchClimateBriefAiContextBriefSectorConditions = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  const { rows } = await pool.query(
    `
      SELECT ai_context_brief_sector_conditions
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.ai_context_brief_sector_conditions ?? null;
};

/** Fetches the AI context brief important stories & narratives. */
export const fetchClimateBriefAiContextBriefImportantStoriesNarratives = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  const { rows } = await pool.query(
    `
      SELECT ai_context_brief_important_stories_narratives
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.ai_context_brief_important_stories_narratives ?? null;
};

/** Fetches the AI context brief trends & capital direction. */
export const fetchClimateBriefAiContextBriefTrendsCapitalDirection = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  const { rows } = await pool.query(
    `
      SELECT ai_context_brief_trends_capital_direction
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.ai_context_brief_trends_capital_direction ?? null;
};

/** Fetches the AI context brief outlook, risks & uncertainties. */
export const fetchClimateBriefAiContextBriefOutlookRisksUncertainties = async (
  intelligenceSet: DailySet,
): Promise<unknown | null> => {
  const { rows } = await pool.query(
    `
      SELECT ai_context_brief_outlook_risks_uncertainties
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows[0]?.ai_context_brief_outlook_risks_uncertainties ?? null;
};
