import pool from "../../../config/database.js";

import type { DailySet } from "./observations.js";

// --------------------------------------------------
// Triage
// --------------------------------------------------
//
// The read and write half of triage against weather.observations. Split out of
// observations.ts so the table has one module per direction of use: that file
// holds what the Observer produces and files, this one holds what Triage reads
// back and promotes.
//
// Triage only ever reads observations and flips one boolean. It does not insert,
// and it never demotes.
// --------------------------------------------------

/** One row as stored in weather.observations. */
export type StoredObservation = {
  id: string;
  intelligence_set_id: string;
  date: string;
  market_domain: string;
  type: string;
  observation: string;
  research_enabled: boolean;
  created_at: string;
};

/** A whole set's observations, with the date that set stands for. */
export type ObservationDay = {
  /** The set's own `set_date`, as `YYYY-MM-DD`. Not read off a row. */
  date: string;
  /** The set these rows belong to. */
  intelligenceSetId: string;
  /** Domain that was filtered on, or `null` when every domain was read. */
  marketDomain: string | null;
  rows: StoredObservation[];
};

/**
 * Every observation filed under one intelligence set, optionally one domain.
 *
 * Scoped by `intelligence_set_id` rather than by `date`, because that is the
 * column the database actually ties a row to a day's work: it is the foreign key
 * to `intelligence_sets.daily_sets`, and `daily_sets.set_date` is UNIQUE, so the
 * set is the authoritative grouping. `weather.observations.date` is a plain
 * NOT NULL column with no constraint tying it to the set's date, so filtering on
 * it depends on an invariant the schema does not enforce - one that holds today
 * and would silently select the wrong rows if an observation ever carried a date
 * other than its set's.
 *
 * The returned date is the set's own `set_date`, so the artifact name and the
 * rows can never disagree about which day they are.
 *
 * Filtering per domain keeps a domain's triage reading only its own signals. What
 * counts as an important signal is domain-specific, so triaging every domain in
 * one pass would hold a thin domain to a thick one's bar.
 *
 * @param marketDomain `null` reads every domain in the set.
 */
export const fetchObservationsForSet = async (
  intelligenceSet: DailySet,
  marketDomain: string | null = null,
): Promise<ObservationDay> => {
  const values: unknown[] = [intelligenceSet.id];
  const conditions = ["intelligence_set_id = $1::uuid"];

  // Bound rather than interpolated, so a domain holding a quote or a semicolon
  // stays a value.
  if (marketDomain !== null) {
    values.push(marketDomain);

    conditions.push(`market_domain = $${values.length}`);
  }

  const { rows } = await pool.query(
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
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY created_at ASC;
    `,
    values,
  );

  return {
    date: intelligenceSet.set_date,
    intelligenceSetId: intelligenceSet.id,
    marketDomain,
    rows: rows as StoredObservation[],
  };
};

/**
 * Turns on `research_enabled` for the given observations.
 *
 * One statement for the batch, so the whole promotion is atomic and needs no
 * explicit transaction.
 *
 * `research_enabled = FALSE` in the WHERE clause is the important part: this only
 * ever promotes a row, never demotes one. An observation an earlier run already
 * promoted stays promoted, and re-running triage cannot undo a previous
 * decision. `rowCount` therefore counts rows that actually changed, not rows
 * matched.
 *
 * @returns How many rows changed from false to true.
 */
export const enableResearchForIds = async (ids: string[]): Promise<number> => {
  if (ids.length === 0) return 0;

  const { rowCount } = await pool.query(
    `
      UPDATE weather.observations
      SET research_enabled = TRUE
      WHERE id = ANY($1::uuid[])
        AND research_enabled = FALSE;
    `,
    [ids],
  );

  return rowCount ?? 0;
};
