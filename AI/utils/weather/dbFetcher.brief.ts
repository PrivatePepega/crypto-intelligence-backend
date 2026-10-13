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
// - **Uniqueness is `(brief_date, domain)`.** Six domains run against one intelligence
//   set, so a date alone does not identify a brief - it identifies six of them. Every
//   read that means "the brief for this day" therefore takes a domain, and the two
//   that could have meant any domain have been made to take one explicitly rather
//   than silently returning whichever row the database happened to order first.
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
   * The domain this brief describes.
   *
   * Named `domain` rather than `market_domain` to match the column, but it holds the
   * same value as `weather.observations.market_domain` - a reader comparing a brief
   * to the observations it summarises should not have to know the two names differ.
   */
  domain: string;
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
 * `marketDomain` rather than `domain` to match the observer config the caller has to
 * hand, and because this is the argument rather than the stored column.
 *
 * The three payloads are typed `unknown` rather than as briefs. Nothing here
 * validates them: they are model output that was already parsed once, and a second
 * validation pass would only be a second place for the contract to drift.
 */
export type BriefToStore = {
  /** The domain this brief describes. Part of the row's identity, not a label. */
  marketDomain: string;
  rawAnalystOutput: unknown;
  aiContextBrief: unknown;
  humanBrief: unknown;
};

/** The columns every read below selects, in one place so the reads cannot drift. */
const COLUMNS = `
        id,
        intelligence_set_id,
        brief_date::text AS brief_date,
        domain,
        raw_analyst_output,
        ai_context_brief,
        human_brief,
        created_at,
        updated_at`;

/**
 * Every brief filed under one intelligence set, newest first.
 *
 * Scoped by `intelligence_set_id` rather than by `brief_date` for the same reason the
 * researcher is: the foreign key is what ties a row to a day's work.
 *
 * Returns all six domains' rows for the set, since a dump of the day's work is the
 * point. Narrow it with {@link fetchBriefsForSetAndDomain} when one domain is wanted.
 *
 * `brief_date::text` because `pg` turns a DATE into a local-time Date, which reads
 * back a day early west of UTC.
 */
export const fetchBriefsForSet = async (intelligenceSet: DailySet): Promise<StoredBrief[]> => {
  const { rows } = await pool.query(
    `
      SELECT${COLUMNS}
      FROM weather.daily_briefs
      WHERE intelligence_set_id = $1::uuid
      ORDER BY brief_date DESC, domain ASC;
    `,
    [intelligenceSet.id],
  );

  return rows as StoredBrief[];
};

/** One set's briefs for one domain only. */
export const fetchBriefsForSetAndDomain = async (
  intelligenceSet: DailySet,
  marketDomain: string,
): Promise<StoredBrief[]> => {
  const { rows } = await pool.query(
    `
      SELECT${COLUMNS}
      FROM weather.daily_briefs
      WHERE intelligence_set_id = $1::uuid
        AND domain = $2
      ORDER BY brief_date DESC;
    `,
    [intelligenceSet.id, marketDomain],
  );

  return rows as StoredBrief[];
};

/**
 * One brief by its intelligence date and domain. `null` when that day has none.
 *
 * Both are required because a date identifies six briefs. Returning the first row for
 * a date alone would make the answer depend on the order the database happened to
 * return, which is the kind of thing that looks stable until it does not.
 *
 * Bound, not interpolated, so both stay values.
 */
export const fetchBriefByDate = async (
  briefDate: string,
  marketDomain: string,
): Promise<StoredBrief | null> => {
  const { rows } = await pool.query(
    `
      SELECT${COLUMNS}
      FROM weather.daily_briefs
      WHERE brief_date = $1::date
        AND domain = $2;
    `,
    [briefDate, marketDomain],
  );

  return rows[0] ?? null;
};

/**
 * The most recent brief for one domain, whatever intelligence set it belongs to.
 *
 * What a reader wants when they ask for "today's brief" without naming a set - the
 * frontend's usual case, where the date in the URL is the thing they can see.
 *
 * The domain is required for the same reason {@link fetchBriefByDate} needs it: a
 * date alone is six briefs.
 */
export const fetchLatestBrief = async (marketDomain: string): Promise<StoredBrief | null> => {
  const { rows } = await pool.query(
    `
      SELECT${COLUMNS}
      FROM weather.daily_briefs
      WHERE domain = $1
      ORDER BY brief_date DESC
      LIMIT 1;
    `,
    [marketDomain],
  );

  return rows[0] ?? null;
};

/**
 * Stores one day's brief for one domain, replacing any brief already filed under that
 * date and domain.
 *
 * ## Why an upsert rather than an insert
 *
 * `(brief_date, domain)` is UNIQUE, so a plain INSERT would fail on the second run for
 * a pair - and re-running the Brief Analyst is normal, since it is the most expensive
 * stage to redo from scratch. `ON CONFLICT (brief_date, domain)` makes a repeat run
 * replace that day's row for that domain instead of erroring, and leaves the other
 * five domains' rows untouched.
 *
 * ## What it does and does not touch
 *
 * `created_at` is left alone on conflict. It is when this date and domain first got a
 * brief, and overwriting it would lose that. `updated_at` is set explicitly because
 * the table has no trigger on it, so a bare upsert would leave the row claiming to
 * have been written when it was first written.
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
      `[inject] Brief injection skipped for date: ${intelligenceSet.set_date} ` +
        `domain: ${brief.marketDomain} - missing ${missing.join(", ")}, ` +
        `and weather.daily_briefs has no column for a partial brief`,
    );

    return null;
  }

  console.log(
    `[inject] Brief injection initialized for date: ${intelligenceSet.set_date} ` +
      `domain: ${brief.marketDomain}`,
  );

  // The objects are bound directly rather than stringified here: `pg` serializes a
  // non-string value to JSON for a jsonb parameter. Stringifying in this module too
  // would be the same work done twice, in two places that could disagree.
  const { rows } = await pool.query(
    `
      INSERT INTO weather.daily_briefs (
        intelligence_set_id, brief_date, domain,
        raw_analyst_output, ai_context_brief, human_brief
      )
      VALUES ($1::uuid, $2::date, $3, $4::jsonb, $5::jsonb, $6::jsonb)
      ON CONFLICT (brief_date, domain) DO UPDATE SET
        intelligence_set_id = EXCLUDED.intelligence_set_id,
        raw_analyst_output = EXCLUDED.raw_analyst_output,
        ai_context_brief     = EXCLUDED.ai_context_brief,
        human_brief          = EXCLUDED.human_brief,
        updated_at           = NOW()
      RETURNING${COLUMNS};
    `,
    [
      intelligenceSet.id,
      intelligenceSet.set_date,
      brief.marketDomain,
      brief.rawAnalystOutput,
      brief.aiContextBrief,
      brief.humanBrief,
    ],
  );

  const stored = rows[0] as StoredBrief | undefined;

  console.log(
    `[inject] Brief injection finalized for date: ${intelligenceSet.set_date} ` +
      `domain: ${brief.marketDomain} - row ${stored?.id ?? "unknown"} written`,
  );

  return stored ?? null;
};

/**
 * Deletes briefs filed under one intelligence set.
 *
 * @param marketDomain Narrow the delete to a single domain. Left out, every domain's
 *   briefs for the set go - which is the right default when clearing a whole set to
 *   re-run it, and the wrong one when a single domain was skipped and is being
 *   re-run, which is the common case now that a failed domain is skipped rather than
 *   taking the run down with it.
 * @returns How many rows were removed.
 */
export const deleteBriefsForSet = async (
  intelligenceSet: DailySet,
  marketDomain?: string,
): Promise<number> => {
  const { rowCount } =
    marketDomain === undefined
      ? await pool.query(`DELETE FROM weather.daily_briefs WHERE intelligence_set_id = $1::uuid;`, [
          intelligenceSet.id,
        ])
      : await pool.query(
          `DELETE FROM weather.daily_briefs WHERE intelligence_set_id = $1::uuid AND domain = $2;`,
          [intelligenceSet.id, marketDomain],
        );

  return rowCount ?? 0;
};
