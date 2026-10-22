import { tool } from "ai";
import { z } from "zod";

import pool from "../../config/database.js";

import type { ClimateDomain, ClimateSection } from "../utils/climate/databaseFetchers.js";

// --------------------------------------------------
// Fetch climate brief
// --------------------------------------------------
//
// Read-only access to the section cells in climate.climate_briefs.
//
// ## Which cells this reads
//
// Each section has three stored representations:
//
// - `_data` (sections 03-06 per domain): the brief itself
// - `human_brief_*`: the frontend-ready text
// - `ai_context_brief_*`: the structured context for downstream agents
//
// The stage columns `_relevance_router`, `_researcher` and `_analysis` are
// intermediate pipeline work, so this tool never selects or returns them.
//
// ## Why the date resolves to a set first
//
// `climate.climate_briefs` has no unique constraint beyond its primary key, so a
// date alone can match more than one row. Resolving `intelligence_sets.daily_sets`
// by its UNIQUE `set_date` and then scoping on `intelligence_sets_id` is the same
// choice the climate database fetchers and the weather tool make. When duplicates
// do exist, the newest row wins.
//
// ## Section and domain
//
// `_data` cells for sections 01 and 02 are merged and have no domain; sections
// 03-06 have one `_data` cell per domain and therefore require one. The human and
// AI context briefs are one cell per section, so they ignore the domain. The
// column name is built from the enums and then checked against a plain-name
// pattern before it reaches the statement, since identifiers cannot be bound.
// --------------------------------------------------

/** The only date form accepted, matching the rest of the pipeline. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A bare SQL column name. */
const COLUMN_PATTERN = /^[a-z_][a-z0-9_]*$/;

/** The six sections, in the order the brief presents them. */
const SECTIONS = [
  "global_overview",
  "macro_market_regime",
  "sector_conditions",
  "important_stories_narratives",
  "trends_capital_direction",
  "outlook_risks_uncertainties",
] as const satisfies readonly ClimateSection[];

/** The domains stored in climate.climate_briefs, matching the column names. */
const DOMAINS = [
  "geopolitics",
  "financial_markets",
  "macro",
  "commodities_energy",
  "crypto",
  "ai_technology_industry",
] as const satisfies readonly ClimateDomain[];

/** The stored representations this tool can read. */
export type ClimateBriefKind = "data" | "human_brief" | "ai_context_brief";

/** The three kinds, in the order they are produced. */
const KINDS = [
  "data",
  "human_brief",
  "ai_context_brief",
] as const satisfies readonly ClimateBriefKind[];

/** One row from climate.climate_briefs, reduced to the requested cell. */
type BriefRow = {
  uuid: string;
  intelligence_sets_id: string;
  date: string;
  data: unknown;
};

/** One requested cell from a climate brief row. */
export type ClimateBriefData = {
  /** `true` when the row exists and the requested cell has content. */
  found: boolean;
  date: string;
  section: ClimateSection;
  /** Which stored representation was read. */
  kind: ClimateBriefKind;
  /** The domain read, or `null` when the cell is not domain-specific. */
  domain: ClimateDomain | null;
  /** The column that was read, so the caller can see exactly which cell answered. */
  column: string;
  /** The set the date resolved to, or `null` when that day has no set. */
  intelligenceSetId: string | null;
  /** The climate brief row the cell came from, or `null` when there is no row. */
  briefUuid: string | null;
  /**
   * The cell as stored: a Markdown string for `data` and `human_brief`, a
   * structured object for `ai_context_brief`, or `null` when unset.
   */
  data: unknown | null;
};

/**
 * Validates a `YYYY-MM-DD` date, including that it names a real calendar day.
 *
 * The format check alone would let `2026-02-31` through, and Postgres would then
 * reject the cast with a less useful message. `Date` rolls an impossible day into
 * the next month, so comparing the round trip back to the input catches it.
 */
const requireDate = (value: string): string => {
  const trimmed = value.trim();

  if (!DATE_PATTERN.test(trimmed)) {
    throw new Error(`date must be in YYYY-MM-DD form, received ${JSON.stringify(value)}`);
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new Error(`date is not a real calendar day: ${JSON.stringify(value)}`);
  }

  return trimmed;
};

/** Checks that a name is safe to interpolate as a column. */
const requireColumn = (column: string): string => {
  if (!COLUMN_PATTERN.test(column)) {
    throw new Error(`resolved column is not a plain SQL name: ${JSON.stringify(column)}`);
  }

  return column;
};

/**
 * Resolves the column for a section, kind and domain.
 *
 * The human and AI context briefs are one cell per section, so they never need a
 * domain. `_data` for sections 01 and 02 is also merged; `_data` for sections
 * 03-06 has no merged cell, so a domain is required rather than silently reading
 * one of the six.
 */
const briefColumn = (
  section: ClimateSection,
  kind: ClimateBriefKind,
  domain: ClimateDomain | null,
): string => {
  if (kind === "human_brief") {
    return requireColumn(`human_brief_${section}`);
  }

  if (kind === "ai_context_brief") {
    return requireColumn(`ai_context_brief_${section}`);
  }

  const column =
    section === "global_overview" || section === "macro_market_regime"
      ? `${section}_data`
      : domain === null
        ? null
        : `${section}_${domain}_data`;

  if (column === null) {
    throw new Error(
      `domain is required for section "${section}" - choose one of: ${DOMAINS.join(", ")}`,
    );
  }

  return requireColumn(column);
};

/**
 * Whether a cell holds anything.
 *
 * TEXT columns come back as an empty string when they were written as one, and an
 * empty brief is not a brief. JSONB values are objects or arrays and count once
 * they exist.
 */
const hasContent = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;

  if (typeof value === "string") return value.trim() !== "";

  return true;
};

/**
 * Reads one stored cell for one section and date.
 *
 * Resolves to `found: false` and `data: null` when the date has no set, the set
 * has no climate brief row, or the requested cell is unset - those are answers,
 * not errors, because a pipeline may not have run for that representation yet.
 * Invalid input throws.
 *
 * @param date A day in `YYYY-MM-DD` form, e.g. `2026-10-20`.
 * @param section One of the six climate brief sections.
 * @param kind `data` (the default), `human_brief`, or `ai_context_brief`.
 * @param domain One climate domain. Used only for `data` on sections 03-06 and
 *   ignored for the merged sections and the human/AI context briefs.
 */
export const fetchClimateBriefData = async (
  date: string,
  section: ClimateSection,
  kind: ClimateBriefKind = "data",
  domain?: ClimateDomain | null,
): Promise<ClimateBriefData> => {
  const briefDate = requireDate(date);

  const merged = section === "global_overview" || section === "macro_market_regime";

  const usesDomain = kind === "data" && !merged;

  const effectiveDomain = usesDomain ? (domain ?? null) : null;

  const column = briefColumn(section, kind, effectiveDomain);

  const setResult = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM intelligence_sets.daily_sets
      WHERE set_date = $1::date;
    `,
    [briefDate],
  );

  const intelligenceSetId = setResult.rows[0]?.id ?? null;

  if (intelligenceSetId === null) {
    return {
      found: false,
      date: briefDate,
      section,
      kind,
      domain: effectiveDomain,
      column,
      intelligenceSetId: null,
      briefUuid: null,
      data: null,
    };
  }

  const { rows } = await pool.query<BriefRow>(
    `
      SELECT
        uuid,
        intelligence_sets_id,
        date::text AS date,
        ${column} AS data
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [intelligenceSetId],
  );

  const row = rows[0];

  if (!row) {
    return {
      found: false,
      date: briefDate,
      section,
      kind,
      domain: effectiveDomain,
      column,
      intelligenceSetId,
      briefUuid: null,
      data: null,
    };
  }

  return {
    found: hasContent(row.data),
    date: briefDate,
    section,
    kind,
    domain: effectiveDomain,
    column,
    intelligenceSetId,
    briefUuid: row.uuid,
    data: row.data ?? null,
  };
};

/** The tool the agents name. */
export const fetchClimateBriefTool = tool({
  description:
    "Reads one stored representation of a climate brief section for one day.\n\n" +
    "Kinds:\n" +
    "- data: the brief itself (sections 03-06 are per domain)\n" +
    "- human_brief: the frontend-ready text for the section\n" +
    "- ai_context_brief: the structured context for downstream agents\n\n" +
    "The relevance router, researcher and analysis stages are never returned.\n\n" +
    "Sections:\n" +
    "- global_overview and macro_market_regime: one merged `data` cell, no domain\n" +
    "- sector_conditions, important_stories_narratives, trends_capital_direction " +
    "and outlook_risks_uncertainties: `data` is per domain, so domain is required " +
    "for that kind; human_brief and ai_context_brief are one cell per section\n\n" +
    "Use for:\n" +
    "- quoting what the stored climate brief says for a section\n" +
    "- reading the frontend text or the agent context for a section\n" +
    "- reading one domain's section without the other five\n" +
    "- checking whether a day's brief has been written\n" +
    "\n" +
    "Limitations:\n" +
    "- read-only; it never changes a row\n" +
    "- one section and one kind at a time\n" +
    "- returns found: false when the date, row or cell has no content\n" +
    "- returned as stored: Markdown for data/human_brief, an object for " +
    "ai_context_brief",

  inputSchema: z.object({
    date: z.string().describe("The day to read, in YYYY-MM-DD form - for example 2026-10-20."),

    section: z
      .enum(SECTIONS)
      .describe(
        "The brief section to read. global_overview and macro_market_regime have a " +
          "single merged cell; the other four are split by domain.",
      ),

    kind: z
      .enum(KINDS)
      .default("data")
      .describe(
        "Which stored representation to read. `data` is the brief itself, " +
          "`human_brief` is the frontend-ready text, and `ai_context_brief` is the " +
          "structured agent context. The relevance router, researcher and analysis " +
          "stages are never available.",
      ),

    domain: z
      .enum(DOMAINS)
      .optional()
      .describe(
        "The domain to read. Required for `data` on sector_conditions, " +
          "important_stories_narratives, trends_capital_direction and " +
          "outlook_risks_uncertainties; ignored for those sections' human_brief and " +
          "ai_context_brief cells, and for global_overview and macro_market_regime.",
      ),
  }),

  execute: async ({ date, section, kind, domain }) =>
    await fetchClimateBriefData(date, section, kind, domain),
});
