import pool from "../../../config/database.js";
import type { RelevanceRouterInput } from "../../climate/schemas/relevanceRouter.schema.js";

import type { DailySet } from "../weather/observations.js";
import type { ClimateDomain, ClimateSection, ClimateStage } from "./databaseFetchers.js";

// --------------------------------------------------
// Climate Brief Injectors
// --------------------------------------------------
//
// The write half of the climate brief against climate.climate_briefs.
//
// Unlike weather.daily_briefs, which stores one brief per domain with an upsert
// on (brief_date, domain), climate.climate_briefs has one row per intelligence
// set with 90+ columns. Each injector updates a single column (or a small group
// of columns) so the pipeline can write section by section without overwriting
// what another stage already wrote.
//
// ## The table constrains what can be stored
//
// Three of its properties decide the shape of this module:
//
// - **No unique constraint beyond uuid.** There is no (intelligence_sets_id, date)
//   constraint, so ON CONFLICT cannot target those columns. Every injector below
//   does a check-then-write: if a row exists for the set it UPDATEs the single
//   column, otherwise it INSERTs a new row. This means a re-run of one section
//   leaves every other section's values untouched.
// - **All payload columns are JSONB and nullable.** A null means "not yet populated",
//   which is distinct from an empty value that was deliberately written.
// - **created_at is set by the database.** The injector does not touch it.
// --------------------------------------------------

// --------------------------------------------------
// Column name helpers
// --------------------------------------------------

/** Builds a column name from section, domain, and stage. */
const columnName = (
  section: ClimateSection,
  domain: ClimateDomain | null,
  stage: ClimateStage,
): string => {
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

/**
 * Builds the column name for human brief sections.
 */
const humanBriefColumnName = (section: string): string => {
  const sectionMap: Record<string, string> = {
    global_overview: "global_overview",
    macro_market_regime: "macro_market_regime",
    sector_conditions: "sector_conditions",
    important_stories_narratives: "important_stories_narratives",
    trends_capital_direction: "trends_capital_direction",
    outlook_risks_uncertainties: "outlook_risks_uncertainties",
  };

  const mapped = sectionMap[section];
  if (mapped === undefined) {
    throw new Error(`Unknown section: ${section}`);
  }

  return `human_brief_${mapped}`;
};

/**
 * Builds the column name for AI context brief sections.
 */
const aiContextBriefColumnName = (section: string): string => {
  const sectionMap: Record<string, string> = {
    global_overview: "global_overview",
    macro_market_regime: "macro_market_regime",
    sector_conditions: "sector_conditions",
    important_stories_narratives: "important_stories_narratives",
    trends_capital_direction: "trends_capital_direction",
    outlook_risks_uncertainties: "outlook_risks_uncertainties",
  };

  const mapped = sectionMap[section];
  if (mapped === undefined) {
    throw new Error(`Unknown section: ${section}`);
  }

  return `ai_context_brief_${mapped}`;
};

// --------------------------------------------------
// Generic injectors
// --------------------------------------------------

/**
 * Checks if a climate brief row exists for the given intelligence set.
 * Returns the uuid if it exists, null otherwise.
 */
const findExistingRow = async (intelligenceSet: DailySet): Promise<string | null> => {
  const { rows } = await pool.query(
    `
      SELECT uuid
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSet.id],
  );

  return rows.length > 0 ? (rows[0].uuid as string) : null;
};

/**
 * Injects a single column value into the climate_briefs table.
 *
 * If a row exists for the intelligence set, it updates that column.
 * If no row exists, it inserts a new one with that column set.
 *
 * @param intelligenceSet The intelligence set to scope by.
 * @param column The column name to inject into.
 * @param value The JSONB value to store.
 * @returns The uuid of the inserted or updated row.
 */
export const injectClimateBriefColumn = async (
  intelligenceSet: DailySet,
  column: string,
  value: unknown,
): Promise<string> => {
  const existingUuid = await findExistingRow(intelligenceSet);

  if (existingUuid !== null) {
    const { rows } = await pool.query(
      `
        UPDATE climate.climate_briefs
        SET ${column} = $1::jsonb
        WHERE uuid = $2::uuid
        RETURNING uuid;
      `,
      [value, existingUuid],
    );

    return rows[0].uuid as string;
  }

  const { rows } = await pool.query(
    `
      INSERT INTO climate.climate_briefs (
        intelligence_sets_id, date, ${column}
      )
      VALUES ($1::uuid, $2::date, $3::jsonb)
      RETURNING uuid;
    `,
    [intelligenceSet.id, intelligenceSet.set_date, value],
  );

  return rows[0].uuid as string;
};

/**
 * Injects a stage (data, relevance_router, researcher, analysis) into a section/domain.
 *
 * @param intelligenceSet The intelligence set to scope by.
 * @param section The section to inject into.
 * @param domain The domain (null for global_overview/macro_market_regime).
 * @param stage The analysis stage to inject.
 * @param value The JSONB value to store.
 * @returns The uuid of the inserted or updated row.
 */
export const injectClimateBriefSectionStage = async (
  intelligenceSet: DailySet,
  section: ClimateSection,
  domain: ClimateDomain | null,
  stage: ClimateStage,
  value: unknown,
): Promise<string> => {
  const col = columnName(section, domain, stage);

  return injectClimateBriefColumn(intelligenceSet, col, value);
};

/**
 * Injects all four stages (data, relevance_router, researcher, analysis) for a
 * section/domain combination at once.
 *
 * @param intelligenceSet The intelligence set to scope by.
 * @param section The section to inject into.
 * @param domain The domain (null for global_overview/macro_market_regime).
 * @param stages An object with data, relevance_router, researcher, analysis values.
 * @returns The uuid of the inserted or updated row.
 */
export const injectClimateBriefSectionAllStages = async (
  intelligenceSet: DailySet,
  section: ClimateSection,
  domain: ClimateDomain | null,
  stages: {
    data?: unknown;
    relevance_router?: unknown;
    researcher?: unknown;
    analysis?: unknown;
  },
): Promise<string> => {
  const existingUuid = await findExistingRow(intelligenceSet);

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (stages.data !== undefined) {
    updates.push(`data = $${paramIndex++}`);
    values.push(stages.data);
  }
  if (stages.relevance_router !== undefined) {
    updates.push(`relevance_router = $${paramIndex++}`);
    values.push(stages.relevance_router);
  }
  if (stages.researcher !== undefined) {
    updates.push(`researcher = $${paramIndex++}`);
    values.push(stages.researcher);
  }
  if (stages.analysis !== undefined) {
    updates.push(`analysis = $${paramIndex++}`);
    values.push(stages.analysis);
  }

  if (updates.length === 0) {
    throw new Error("No stages to inject");
  }

  const colPrefix =
    section === "global_overview" || section === "macro_market_regime"
      ? section
      : `${section}_${domain}`;

  const setClause = updates.map((u) => `${colPrefix}_${u}`).join(", ");

  if (existingUuid !== null) {
    const { rows } = await pool.query(
      `
        UPDATE climate.climate_briefs
        SET ${setClause}
        WHERE uuid = $${paramIndex}::uuid
        RETURNING uuid;
      `,
      [...values, existingUuid],
    );

    return rows[0].uuid as string;
  }

  const insertColumns = [
    "intelligence_sets_id",
    "date",
    ...updates.map((u) => `${colPrefix}_${u.split(" = ")[0]}`),
  ];
  const placeholders = insertColumns.map((_, i) => `$${i + 1}`).join(", ");
  const columnNames = insertColumns.join(", ");

  const { rows } = await pool.query(
    `
      INSERT INTO climate.climate_briefs (${columnNames})
      VALUES (${placeholders})
      RETURNING uuid;
    `,
    [intelligenceSet.id, intelligenceSet.set_date, ...values],
  );

  return rows[0].uuid as string;
};

// --------------------------------------------------
// 01 - Global Overview
// --------------------------------------------------

/** Injects the global overview data. */
export const injectClimateBriefGlobalOverviewData = async (
  intelligenceSet: DailySet,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(intelligenceSet, "global_overview_data", value);
};

/** Injects the global overview researcher data. */
export const injectClimateBriefGlobalOverviewResearcher = async (
  intelligenceSet: DailySet,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(intelligenceSet, "global_overview_researcher", value);
};

/** Injects the global overview analysis. */
export const injectClimateBriefGlobalOverviewAnalysis = async (
  intelligenceSet: DailySet,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(intelligenceSet, "global_overview_analysis", value);
};

// --------------------------------------------------
// 02 - Macro & Market Regime
// --------------------------------------------------

/** Injects the macro market regime data. */
export const injectClimateBriefMacroMarketRegimeData = async (
  intelligenceSet: DailySet,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(intelligenceSet, "macro_market_regime_data", value);
};

/** Injects the macro market regime relevance router. */
export const injectClimateBriefMacroMarketRegimeRelevanceRouter = async (
  intelligenceSet: DailySet,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(intelligenceSet, "macro_market_regime_relevance_router", value);
};

/** Injects the macro market regime researcher. */
export const injectClimateBriefMacroMarketRegimeResearcher = async (
  intelligenceSet: DailySet,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(intelligenceSet, "macro_market_regime_researcher", value);
};

/** Injects the macro market regime analysis. */
export const injectClimateBriefMacroMarketRegimeAnalysis = async (
  intelligenceSet: DailySet,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(intelligenceSet, "macro_market_regime_analysis", value);
};

// --------------------------------------------------
// 03 - Sector Conditions
// --------------------------------------------------

/** Injects the sector conditions data for a given domain. */
export const injectClimateBriefSectorConditionsData = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(intelligenceSet, `sector_conditions_${domain}_data`, value);
};

/** Injects the sector conditions relevance router for a given domain. */
export const injectClimateBriefSectorConditionsRelevanceRouter = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `sector_conditions_${domain}_relevance_router`,
    value,
  );
};

/** Injects the sector conditions researcher for a given domain. */
export const injectClimateBriefSectorConditionsResearcher = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(intelligenceSet, `sector_conditions_${domain}_researcher`, value);
};

/** Injects the sector conditions analysis for a given domain. */
export const injectClimateBriefSectorConditionsAnalysis = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(intelligenceSet, `sector_conditions_${domain}_analysis`, value);
};

// --------------------------------------------------
// 04 - Important Stories & Narratives
// --------------------------------------------------

/** Injects the important stories & narratives data for a given domain. */
export const injectClimateBriefImportantStoriesNarrativesData = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `important_stories_narratives_${domain}_data`,
    value,
  );
};

/** Injects the important stories & narratives relevance router for a given domain. */
export const injectClimateBriefImportantStoriesNarrativesRelevanceRouter = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `important_stories_narratives_${domain}_relevance_router`,
    value,
  );
};

/** Injects the important stories & narratives researcher for a given domain. */
export const injectClimateBriefImportantStoriesNarrativesResearcher = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `important_stories_narratives_${domain}_researcher`,
    value,
  );
};

/** Injects the important stories & narratives analysis for a given domain. */
export const injectClimateBriefImportantStoriesNarrativesAnalysis = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `important_stories_narratives_${domain}_analysis`,
    value,
  );
};

// --------------------------------------------------
// 05 - Trends & Capital Direction
// --------------------------------------------------

/** Injects the trends & capital direction data for a given domain. */
export const injectClimateBriefTrendsCapitalDirectionData = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `trends_capital_direction_${domain}_data`,
    value,
  );
};

/** Injects the trends & capital direction relevance router for a given domain. */
export const injectClimateBriefTrendsCapitalDirectionRelevanceRouter = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `trends_capital_direction_${domain}_relevance_router`,
    value,
  );
};

/** Injects the trends & capital direction researcher for a given domain. */
export const injectClimateBriefTrendsCapitalDirectionResearcher = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `trends_capital_direction_${domain}_researcher`,
    value,
  );
};

/** Injects the trends & capital direction analysis for a given domain. */
export const injectClimateBriefTrendsCapitalDirectionAnalysis = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `trends_capital_direction_${domain}_analysis`,
    value,
  );
};

// --------------------------------------------------
// 06 - Outlook, Risks & Uncertainties
// --------------------------------------------------

/** Injects the outlook, risks & uncertainties data for a given domain. */
export const injectClimateBriefOutlookRisksUncertaintiesData = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `outlook_risks_uncertainties_${domain}_data`,
    value,
  );
};

/** Injects the outlook, risks & uncertainties relevance router for a given domain. */
export const injectClimateBriefOutlookRisksUncertaintiesRelevanceRouter = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `outlook_risks_uncertainties_${domain}_relevance_router`,
    value,
  );
};

/** Injects the outlook, risks & uncertainties researcher for a given domain. */
export const injectClimateBriefOutlookRisksUncertaintiesResearcher = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `outlook_risks_uncertainties_${domain}_researcher`,
    value,
  );
};

/** Injects the outlook, risks & uncertainties analysis for a given domain. */
export const injectClimateBriefOutlookRisksUncertaintiesAnalysis = async (
  intelligenceSet: DailySet,
  domain: ClimateDomain,
  value: unknown,
): Promise<string> => {
  return injectClimateBriefColumn(
    intelligenceSet,
    `outlook_risks_uncertainties_${domain}_analysis`,
    value,
  );
};

// --------------------------------------------------
// Human Brief and AI Context Brief
// --------------------------------------------------

/** Injects a human brief section. */
export const injectClimateBriefHumanBrief = async (
  intelligenceSet: DailySet,
  section: string,
  value: string,
): Promise<string> => {
  const column = humanBriefColumnName(section);

  return injectClimateBriefColumn(intelligenceSet, column, value);
};

/** Injects an AI context brief section. */
export const injectClimateBriefAiContextBrief = async (
  intelligenceSet: DailySet,
  section: string,
  value: unknown,
): Promise<string> => {
  const column = aiContextBriefColumnName(section);

  return injectClimateBriefColumn(intelligenceSet, column, value);
};

const sectionColumnPrefixes: Record<string, string> = {
  "Macro & Market Regime": "macro_market_regime",
  "Sector Conditions": "sector_conditions",
  "Important Stories & Narratives": "important_stories_narratives",
  "Trends & Capital Direction": "trends_capital_direction",
  "Outlook, Risks & Uncertainties": "outlook_risks_uncertainties",
};

const allowedDomains = new Set([
  "geopolitics",
  "financial_markets",
  "macro",
  "commodities_energy",
  "crypto",
  "ai_technology_industry",
]);

export async function injectRelevanceRouterOutput(
  intelligenceSetId: string,
  job: RelevanceRouterInput,
  result: unknown,
) {
  const { section, domain } = job;

  const prefix = sectionColumnPrefixes[section];

  if (!prefix) {
    throw new Error(`Unsupported Climate section: ${section}`);
  }

  const isMacroRegime = section === "Macro & Market Regime";

  const column = isMacroRegime
    ? `${prefix}_relevance_router`
    : `${prefix}_${domain}_relevance_router`;

  // For Macro & Market Regime, all 6 domains' results go into the same cell.
  // Read the existing value and merge the new result's relevantObservations
  // array into it rather than overwriting. Each domain's job adds to the
  // running total instead of replacing it.
  if (isMacroRegime) {
    const existingResult = await pool.query(
      `SELECT ${column} FROM climate.climate_briefs WHERE intelligence_sets_id = $1::uuid`,
      [intelligenceSetId],
    );

    if (existingResult.rows.length === 0) {
      throw new Error(`No climate brief found for intelligence set ${intelligenceSetId}`);
    }

    const existing = existingResult.rows[0][column] as {
      relevantObservations?: unknown[];
    } | null;

    const merged = {
      ...((result as Record<string, unknown>) ?? {}),
      relevantObservations: [
        ...((existing?.relevantObservations ?? []) as unknown[]),
        ...(((result as Record<string, unknown>)?.relevantObservations as unknown[]) ?? []),
      ],
    };

    const response = await pool.query(
      `UPDATE climate.climate_briefs SET ${column} = $1::jsonb WHERE intelligence_sets_id = $2::uuid`,
      [JSON.stringify(merged), intelligenceSetId],
    );

    if (response.rowCount === 0) {
      throw new Error(`No climate brief found for intelligence set ${intelligenceSetId}`);
    }

    return;
  }

  const response = await pool.query(
    `UPDATE climate.climate_briefs SET ${column} = $1::jsonb WHERE intelligence_sets_id = $2::uuid`,
    [JSON.stringify(result), intelligenceSetId],
  );

  if (response.rowCount === 0) {
    throw new Error(`No climate brief found for intelligence set ${intelligenceSetId}`);
  }
}

// --------------------------------------------------
// Researcher
// --------------------------------------------------

/**
 * The researcher reads a section/domain `_data` cell and writes its findings to
 * the matching `_researcher` cell:
 *
 *   macro_market_regime_data       -> macro_market_regime_researcher
 *   sector_conditions_crypto_data  -> sector_conditions_crypto_researcher
 *
 * Each section/domain has exactly one researcher job, so the cell is overwritten
 * rather than merged. Re-running a job replaces its previous findings.
 */
const SECTION_DATA_COLUMN_PATTERN = /^[a-z0-9_]+_data$/;

const DATA_SUFFIX = "_data";

/**
 * Injects a researcher agent result into the matching `_researcher` column.
 *
 * @param intelligenceSetId The climate intelligence set to write into.
 * @param job The job whose `column` identifies the source `_data` cell.
 * @param result The researcher agent output.
 */
export async function injectResearcherOutput(
  intelligenceSetId: string,
  job: { column: string },
  result: unknown,
): Promise<void> {
  const { column } = job;

  // The column is interpolated into SQL, so only accept the exact `<section>_data`
  // shape produced by the loader's trusted target list.
  if (!SECTION_DATA_COLUMN_PATTERN.test(column)) {
    throw new Error(`Unsupported researcher source column: ${column}`);
  }

  const researcherColumn = `${column.slice(0, -DATA_SUFFIX.length)}_researcher`;

  const response = await pool.query(
    `UPDATE climate.climate_briefs SET ${researcherColumn} = $1::jsonb WHERE intelligence_sets_id = $2::uuid`,
    [JSON.stringify(result), intelligenceSetId],
  );

  if (response.rowCount === 0) {
    throw new Error(`No climate brief found for intelligence set ${intelligenceSetId}`);
  }
}

// --------------------------------------------------
// Analyst
// --------------------------------------------------

/**
 * The analyst works from the `<section>_<domain>_data` column and writes into the
 * matching `_analysis` cell:
 *
 *   macro_market_regime_data       -> macro_market_regime_analysis
 *   sector_conditions_crypto_data  -> sector_conditions_crypto_analysis
 *
 * Two analyst jobs run per section/domain (one for today's relevance router
 * output, one for today's researcher findings), so the cell accumulates an array
 * of runs rather than holding a single object. The append is done in a single
 * statement so concurrent jobs cannot overwrite each other's results.
 *
 * Stored shape:
 *   [
 *     { "incomingDataType": "weather_observation", "decisions": [...], "summary": "..." },
 *     { "incomingDataType": "climate_research", "decisions": [...], "summary": "..." }
 *   ]
 */
export async function injectAnalystOutput(
  intelligenceSetId: string,
  job: { column: string; incomingDataType: string },
  result: unknown,
): Promise<void> {
  const { column, incomingDataType } = job;

  // The column is interpolated into SQL, so only accept the exact `<section>_data`
  // shape produced by the loader's trusted target list.
  if (!SECTION_DATA_COLUMN_PATTERN.test(column)) {
    throw new Error(`Unsupported analyst source column: ${column}`);
  }

  const analysisColumn = `${column.slice(0, -DATA_SUFFIX.length)}_analysis`;

  // Tag the run with its input type so the two runs in one cell stay
  // distinguishable without relying on their order.
  const run =
    typeof result === "object" && result !== null
      ? { incomingDataType, ...(result as Record<string, unknown>) }
      : { incomingDataType, result };

  const response = await pool.query(
    `
      UPDATE climate.climate_briefs
      SET ${analysisColumn} = COALESCE(${analysisColumn}, '[]'::jsonb) || jsonb_build_array($1::jsonb)
      WHERE intelligence_sets_id = $2::uuid
    `,
    [JSON.stringify(run), intelligenceSetId],
  );

  if (response.rowCount === 0) {
    throw new Error(`No climate brief found for intelligence set ${intelligenceSetId}`);
  }
}

// --------------------------------------------------
// Writer
// --------------------------------------------------

/**
 * The writer produces today's complete brief for a section/domain and writes it
 * back into that section/domain's own `_data` cell:
 *
 *   sector_conditions_crypto_data -> sector_conditions_crypto_data
 *
 * There is exactly one writer job per cell, so the cell is overwritten rather
 * than merged. Re-running a job replaces today's draft with the new version.
 *
 * `_data` cells are jsonb string scalars holding Markdown (that is how the
 * initializer and yesterday's brief store them), so the brief is stored as a
 * JSON string rather than a bare SQL text value.
 */
export async function injectWriterOutput(
  intelligenceSetId: string,
  job: { column: string },
  result: unknown,
): Promise<void> {
  const { column } = job;

  // The column is interpolated into SQL, so only accept the exact `<section>_data`
  // shape produced by the loader's trusted target list.
  if (!SECTION_DATA_COLUMN_PATTERN.test(column)) {
    throw new Error(`Unsupported writer target column: ${column}`);
  }

  const brief =
    typeof result === "object" && result !== null && "brief" in result
      ? (result as { brief?: unknown }).brief
      : null;

  if (typeof brief !== "string" || brief.trim().length === 0) {
    throw new Error(`Writer produced no brief for column ${column}`);
  }

  const response = await pool.query(
    `UPDATE climate.climate_briefs SET ${column} = $1::jsonb WHERE intelligence_sets_id = $2::uuid`,
    [JSON.stringify(brief), intelligenceSetId],
  );

  if (response.rowCount === 0) {
    throw new Error(`No climate brief found for intelligence set ${intelligenceSetId}`);
  }
}

// --------------------------------------------------
// Human Brief
// --------------------------------------------------

/**
 * The human brief is a single synthesized document per section, written into the
 * matching `human_brief_*` TEXT column:
 *
 *   Sector Conditions -> human_brief_sector_conditions
 *
 * There is exactly one human brief job per section, so the column is overwritten
 * rather than merged. Re-running a job replaces the previous brief.
 */
const HUMAN_BRIEF_COLUMN_PATTERN = /^human_brief_[a-z0-9_]+$/;

/**
 * Injects a human brief agent result into its `human_brief_*` column.
 *
 * @param intelligenceSetId The climate intelligence set to write into.
 * @param column The `human_brief_*` TEXT column for the section.
 * @param brief The complete synthesized brief.
 */
export async function injectHumanBriefOutput(
  intelligenceSetId: string,
  column: string,
  brief: string,
): Promise<void> {
  // The column is interpolated into SQL, so only accept the exact `human_brief_*`
  // shape produced by the loader's trusted section list.
  if (!HUMAN_BRIEF_COLUMN_PATTERN.test(column)) {
    throw new Error(`Unsupported human brief column: ${column}`);
  }

  if (brief.trim().length === 0) {
    throw new Error(`Human Brief agent produced no brief for column ${column}`);
  }

  const response = await pool.query(
    `UPDATE climate.climate_briefs SET ${column} = $1 WHERE intelligence_sets_id = $2::uuid`,
    [brief, intelligenceSetId],
  );

  if (response.rowCount === 0) {
    throw new Error(`No climate brief found for intelligence set ${intelligenceSetId}`);
  }
}

// --------------------------------------------------
// AI Context Brief
// --------------------------------------------------

/**
 * The AI context brief is a single structured document per section, written into
 * the matching `ai_context_brief_*` JSONB column:
 *
 *   Sector Conditions -> ai_context_brief_sector_conditions
 *
 * There is exactly one AI context brief job per section, so the column is
 * overwritten rather than merged. Re-running a job replaces the previous brief.
 */
const AI_CONTEXT_BRIEF_COLUMN_PATTERN = /^ai_context_brief_[a-z0-9_]+$/;

/**
 * Injects an AI context brief agent result into its `ai_context_brief_*` column.
 *
 * @param intelligenceSetId The climate intelligence set to write into.
 * @param column The `ai_context_brief_*` JSONB column for the section.
 * @param result The agent output (`sectionName`, `overview`, `domains`).
 */
export async function injectAIContextBriefOutput(
  intelligenceSetId: string,
  column: string,
  result: unknown,
): Promise<void> {
  // The column is interpolated into SQL, so only accept the exact
  // `ai_context_brief_*` shape produced by the loader's trusted section list.
  if (!AI_CONTEXT_BRIEF_COLUMN_PATTERN.test(column)) {
    throw new Error(`Unsupported AI context brief column: ${column}`);
  }

  if (typeof result !== "object" || result === null) {
    throw new Error(`AI Context Brief agent produced no brief for column ${column}`);
  }

  const response = await pool.query(
    `UPDATE climate.climate_briefs SET ${column} = $1::jsonb WHERE intelligence_sets_id = $2::uuid`,
    [JSON.stringify(result), intelligenceSetId],
  );

  if (response.rowCount === 0) {
    throw new Error(`No climate brief found for intelligence set ${intelligenceSetId}`);
  }
}
