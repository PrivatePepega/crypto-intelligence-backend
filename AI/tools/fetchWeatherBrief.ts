import { tool } from "ai";
import { z } from "zod";

import pool from "../../config/database.js";

import type { ObserverDomain } from "../weather/weather.config.js";

// --------------------------------------------------
// Fetch weather brief
// --------------------------------------------------
//
// Read-only access to the three tables the weather pipeline writes:
//
// - weather.observations  - the Observer's raw signals
// - weather.research      - the Researcher's findings, one row per observation
// - weather.daily_briefs  - the Brief Analyst's output, one row per domain
//
// ## Why the date resolves to a set first
//
// `intelligence_sets.daily_sets.set_date` is UNIQUE, so a date identifies exactly
// one set - and the set is what the rows are actually tied to by foreign key.
// `weather.observations.date` and `weather.research.date` are plain copies with no
// constraint tying them to the set, so filtering on them would rely on an invariant
// the schema does not enforce. This is the same choice dbFetcher.triage.ts and
// dbFetcher.researcher.ts make.
//
// ## One domain or all of them
//
// A domain is optional. When supplied it filters observations and research on
// `market_domain` and briefs on `domain`, because weather.daily_briefs names the
// column differently while holding the same value. The value is bound, not
// interpolated, so it stays a value whatever it contains.
// --------------------------------------------------

/** The only date form accepted, matching the rest of the weather pipeline. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The domains the weather pipeline runs.
 *
 * `satisfies readonly ObserverDomain[]` makes a rename in weather.config.ts a
 * compile error here, so the tool's enum cannot drift from the data it filters.
 */
const DOMAINS = [
  "geopolitics",
  "financial_markets",
  "macro",
  "commodities_energy",
  "crypto",
  "ai_technology_industry",
] as const satisfies readonly ObserverDomain[];

/** One row from weather.observations, as stored. */
export type WeatherObservationRow = {
  id: string;
  intelligence_set_id: string;
  date: string;
  market_domain: string;
  type: string;
  observation: string;
  research_enabled: boolean;
  created_at: string;
};

/** One row from weather.research, as stored. */
export type WeatherResearchRow = {
  id: string;
  intelligence_set_id: string;
  observation_id: string;
  date: string;
  market_domain: string;
  type: string;
  observation: string;
  research: string;
  created_at: string;
};

/** One row from weather.daily_briefs, as stored. */
export type WeatherBriefRow = {
  id: string;
  intelligence_set_id: string;
  brief_date: string;
  domain: string;
  raw_analyst_output: unknown;
  ai_context_brief: unknown;
  human_brief: unknown;
  created_at: string;
  updated_at: string;
};

/** Everything one date holds across the three tables. */
export type WeatherBriefData = {
  /** `false` when the date has no set, or the set holds no rows at all. */
  found: boolean;
  date: string;
  /** The domain that was filtered on, or `null` when every domain was read. */
  domain: string | null;
  /** The set the date resolved to, or `null` when that day has no set. */
  intelligenceSetId: string | null;
  counts: {
    observations: number;
    research: number;
    briefs: number;
  };
  observations: WeatherObservationRow[];
  research: WeatherResearchRow[];
  briefs: WeatherBriefRow[];
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

/**
 * Reads one date's observations, research and daily briefs.
 *
 * Resolves to empty arrays and `found: false` when the date has no set or the set
 * holds nothing - that is an answer, not an error, because a pipeline may simply
 * not have run for that day. Invalid input throws.
 *
 * @param date A day in `YYYY-MM-DD` form, e.g. `2026-10-15`.
 * @param domain One weather domain, or omitted/`null` for every domain.
 */
export const fetchWeatherBrief = async (
  date: string,
  domain?: string | null,
): Promise<WeatherBriefData> => {
  const briefDate = requireDate(date);

  const trimmedDomain = domain?.trim() ?? "";
  const marketDomain = trimmedDomain === "" ? null : trimmedDomain;

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
      domain: marketDomain,
      intelligenceSetId: null,
      counts: { observations: 0, research: 0, briefs: 0 },
      observations: [],
      research: [],
      briefs: [],
    };
  }

  const values: unknown[] = [intelligenceSetId];

  if (marketDomain !== null) {
    values.push(marketDomain);
  }

  // All three queries share the same placeholders, so one values array serves them.
  const marketDomainFilter = marketDomain === null ? "" : "\n        AND market_domain = $2";
  const briefDomainFilter = marketDomain === null ? "" : "\n        AND domain = $2";

  const [observationResult, researchResult, briefResult] = await Promise.all([
    pool.query<WeatherObservationRow>(
      `
        SELECT
          id,
          intelligence_set_id,
          date::text AS date,
          market_domain,
          type,
          observation,
          research_enabled,
          created_at
        FROM weather.observations
        WHERE intelligence_set_id = $1::uuid${marketDomainFilter}
        ORDER BY created_at ASC;
      `,
      values,
    ),

    pool.query<WeatherResearchRow>(
      `
        SELECT
          id,
          intelligence_set_id,
          observation_id,
          date::text AS date,
          market_domain,
          type,
          observation,
          research,
          created_at
        FROM weather.research
        WHERE intelligence_set_id = $1::uuid${marketDomainFilter}
        ORDER BY created_at ASC;
      `,
      values,
    ),

    pool.query<WeatherBriefRow>(
      `
        SELECT
          id,
          intelligence_set_id,
          brief_date::text AS brief_date,
          domain,
          raw_analyst_output,
          ai_context_brief,
          human_brief,
          created_at,
          updated_at
        FROM weather.daily_briefs
        WHERE intelligence_set_id = $1::uuid${briefDomainFilter}
        ORDER BY domain ASC;
      `,
      values,
    ),
  ]);

  const observations = observationResult.rows;
  const research = researchResult.rows;
  const briefs = briefResult.rows;

  return {
    found: observations.length + research.length + briefs.length > 0,
    date: briefDate,
    domain: marketDomain,
    intelligenceSetId,
    counts: {
      observations: observations.length,
      research: research.length,
      briefs: briefs.length,
    },
    observations,
    research,
    briefs,
  };
};

/** The tool the agents name. */
export const fetchWeatherBriefTool = tool({
  description:
    "Reads the stored weather-pipeline output for one day: raw observations, the " +
    "researcher's findings, and the Brief Analyst's daily briefs.\n\n" +
    "Returns three arrays for the date:\n" +
    "- observations: what the Observer captured (market_domain, type, observation)\n" +
    "- research: what the Researcher found, each linked to its observation_id\n" +
    "- briefs: raw_analyst_output, ai_context_brief and human_brief, one row per domain\n\n" +
    "Use for:\n" +
    "- quoting what a stored brief actually says instead of re-deriving it\n" +
    "- reading a specific domain's brief, research or observations\n" +
    "- checking what a day's pipeline captured\n" +
    "\n" +
    "Limitations:\n" +
    "- read-only; it never changes a row\n" +
    "- one date at a time\n" +
    "- returns found: false when that day has no set or the pipeline has not run for it\n" +
    "- omit domain to read every domain; the payload is smaller when one is named",

  inputSchema: z.object({
    date: z.string().describe("The day to read, in YYYY-MM-DD form - for example 2026-10-15."),

    domain: z
      .enum(DOMAINS)
      .optional()
      .describe(
        "Limit the result to one weather domain. Omit to return every domain stored " +
          "for the date.",
      ),
  }),

  execute: async ({ date, domain }) => await fetchWeatherBrief(date, domain),
});
