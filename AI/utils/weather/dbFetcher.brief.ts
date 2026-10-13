import pool from "../../../config/database.js";

import type { DailySet } from "./observations.js";

// --------------------------------------------------
// Brief Analyst
// --------------------------------------------------
//
// The daily briefs, against weather.daily_briefs. One module per agent, matching
// dbFetcher.triage.ts and dbFetcher.researcher.ts.
//
// ## The table constrains what can be stored
//
// Three of its properties decide the shape of this module, and all three are worth
// knowing before reading the functions below:
//
// - **`brief_date` is UNIQUE and there is no `market_domain`.** One brief per day,
//   full stop. Two domains run for the same intelligence set would collide on the
//   second one. If per-domain briefs are ever wanted, the column has to be added and
//   the uniqueness relaxed to `(brief_date, market_domain)`.
// - **All three payload columns are `NOT NULL`.** There is nowhere to record "the
//   analyst ran but the AI context brief failed". {@link upsertBrief} refuses a
//   partial write rather than filling a hole with `{}`, which would be
//   indistinguishable from a genuinely empty brief to anything reading the row.
// - **There is no trigger on `updated_at`.** It is a plain column with a default, so
//   an upsert has to set it by hand or every re-run leaves a stale timestamp.
// --------------------------------------------------

/** One brief row as stored. */
export type StoredBrief = {
  id: string;
  intelligence_set_id: string;
  brief_date: string;
  /**
   * The analyst's own output, as stored.
   *
   * `unknown` because each column's shape is set by the prompt that produced it, not
   * by this module. The analyst emits a fixed ten-key shape; the human brief's shape
   * is the Lead Editor's editorial choice and changes between runs. Tighten these once
   * the shapes settle across runs - before anything reads them programmatically,
   * because a schema that changes between runs makes two rows incomparable.
   */
  raw_analyst_output: unknown;
  /** The machine-readable intelligence context. Shape set by `aiContextBrief.ts`. */
  ai_context_brief: unknown;
  /** The readable publication. Shape set by `humanBrief.ts`. */
  human_brief: unknown;
  created_at: string;
  updated_at: string;
};

/**
 * One brief, ready to store.
 *
 * All three payloads are required and typed `unknown` rather than as briefs. Nothing
 * here validates them: they are model output that was already parsed once, and a
 * second validation pass would only be a second place for the contract to drift.
 */
export type BriefToStore = {
  rawAnalystOutput: unknown;
  aiContextBrief: unknown;
  humanBrief: unknown;
};

/**
 * Every brief filed under one intelligence set, newest first.
 *
 * Scoped by `intelligence_set_id` rather than by `brief_date` for the same reason the
 * researcher is: the foreign key is what ties a row to a day's work.
 *
 * `brief_date::text` because `pg` turns a DATE into a local-time Date, which reads
 * back a day early west of UTC.
 */
export const fetchBriefsForSet = async (intelligenceSet: DailySet): Promise<StoredBrief[]> => {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        intelligence_set_id,
        brief_date::text AS brief_date,
        raw_analyst_output,
        ai_context_brief,
        human_brief,
        created_at,
        updated_at
      FROM weather.daily_briefs
      WHERE intelligence_set_id = $1::uuid
      ORDER BY brief_date DESC;
    `,
    [intelligenceSet.id],
  );

  return rows as StoredBrief[];
};

/**
 * One brief by its intelligence date, `YYYY-MM-DD`. `null` when that day has none.
 *
 * Bound, not interpolated, so the date stays a value.
 */
export const fetchBriefByDate = async (briefDate: string): Promise<StoredBrief | null> => {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        intelligence_set_id,
        brief_date::text AS brief_date,
        raw_analyst_output,
        ai_context_brief,
        human_brief,
        created_at,
        updated_at
      FROM weather.daily_briefs
      WHERE brief_date = $1::date;
    `,
    [briefDate],
  );

  return rows[0] ?? null;
};

/**
 * The most recent brief, whatever intelligence set it belongs to.
 *
 * What a reader wants when they ask for "today's brief" without naming a set - the
 * frontend's usual case, where the date in the URL is the thing they can see.
 */
export const fetchLatestBrief = async (): Promise<StoredBrief | null> => {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        intelligence_set_id,
        brief_date::text AS brief_date,
        raw_analyst_output,
        ai_context_brief,
        human_brief,
        created_at,
        updated_at
      FROM weather.daily_briefs
      ORDER BY brief_date DESC
      LIMIT 1;
    `,
  );

  return rows[0] ?? null;
};

/**
 * Stores one day's brief, replacing any brief already filed under that date.
 *
 * ## Why an upsert rather than an insert
 *
 * `brief_date` is UNIQUE, so a plain INSERT would fail on the second run for a date -
 * and re-running the Brief Analyst for a set is normal, since it is the most
 * expensive stage to redo from scratch. `ON CONFLICT (brief_date)` makes a repeat run
 * replace the day's row instead of erroring.
 *
 * ## What it does and does not touch
 *
 * `created_at` is left alone on conflict. It is when the date first got a brief, and
 * overwriting it would lose that. `updated_at` is set explicitly because the table
 * has no trigger on it, so a bare upsert would leave the row claiming to have been
 * written when it was first written.
 *
 * `intelligence_set_id` *is* updated: a date re-analysed under a new set belongs to
 * the new set, and leaving the old id would make {@link fetchBriefsForSet} report the
 * brief under a set that no longer produced it.
 *
 * ## Why a missing payload refuses rather than defaults
 *
 * All three payload columns are `NOT NULL`, and the three agents can fail
 * independently. Writing `{}` for a failed one would store a row that reads exactly
 * like a brief that genuinely produced nothing - and the difference between "the model
 * returned nothing" and "the call never succeeded" is usually the thing worth knowing.
 * So this returns `null` and says which payload was missing, and the caller decides
 * whether to retry that one phase or leave the date unbriefed.
 *
 * @param intelligenceSet Supplies `brief_date`, so the row is filed under the same
 *   period the run analysed rather than a date typed at the call site.
 * @returns The stored row, or `null` when a payload was missing.
 */
export const upsertBrief = async (
  intelligenceSet: DailySet,
  brief: BriefToStore,
): Promise<StoredBrief | null> => {
  const missing = (["rawAnalystOutput", "aiContextBrief", "humanBrief"] as const).filter(
    (key) => brief[key] === null || brief[key] === undefined,
  );

  if (missing.length > 0) {
    console.log(
      `[inject] Brief injection skipped for date: ${intelligenceSet.set_date} - ` +
        `missing ${missing.join(", ")}, and weather.daily_briefs has no column for a partial brief`,
    );

    return null;
  }

  console.log(`[inject] Brief injection initialized for date: ${intelligenceSet.set_date}`);

  // The objects are bound directly rather than stringified here: `pg` serializes a
  // non-string value to JSON for a jsonb parameter. Stringifying in this module too
  // would be the same work done twice, in two places that could disagree.
  const { rows } = await pool.query(
    `
      INSERT INTO weather.daily_briefs (
        intelligence_set_id, brief_date,
        raw_analyst_output, ai_context_brief, human_brief
      )
      VALUES ($1::uuid, $2::date, $3::jsonb, $4::jsonb, $5::jsonb)
      ON CONFLICT (brief_date) DO UPDATE SET
        intelligence_set_id = EXCLUDED.intelligence_set_id,
        raw_analyst_output = EXCLUDED.raw_analyst_output,
        ai_context_brief     = EXCLUDED.ai_context_brief,
        human_brief          = EXCLUDED.human_brief,
        updated_at           = NOW()
      RETURNING
        id,
        intelligence_set_id,
        brief_date::text AS brief_date,
        raw_analyst_output,
        ai_context_brief,
        human_brief,
        created_at,
        updated_at;
    `,
    [
      intelligenceSet.id,
      intelligenceSet.set_date,
      brief.rawAnalystOutput,
      brief.aiContextBrief,
      brief.humanBrief,
    ],
  );

  const stored = rows[0] as StoredBrief | undefined;

  console.log(
    `[inject] Brief injection finalized for date: ${intelligenceSet.set_date} - ` +
      `row ${stored?.id ?? "unknown"} written`,
  );

  return stored ?? null;
};
