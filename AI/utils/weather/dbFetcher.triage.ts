import pool from "../../../config/database.js";

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

/** A whole day of observations, with the date and domain that were queried. */
export type ObservationDay = {
  /** Resolved date as `YYYY-MM-DD`, whether or not any rows matched. */
  date: string;
  /** Domain that was filtered on, or `null` when every domain was read. */
  marketDomain: string | null;
  rows: StoredObservation[];
};

/**
 * Every observation recorded for one date, optionally narrowed to one domain.
 *
 * The date is resolved in the database rather than by the process, and the
 * resolved value is returned. That matters for a daily pipeline: the Observer
 * stamped its rows with `CURRENT_DATE`, so reading the same expression back means
 * both halves agree even across a midnight boundary or a process running in a
 * different timezone. It also means an empty day still reports which day was
 * empty, which a rows-only result could not.
 *
 * Filtering per domain is what keeps a domain's triage reading only its own
 * signals. An observation says which domain it came from, but nothing about
 * *importance* is domain-relative, so triaging the whole day at once would judge
 * a climate signal against a crypto backlog.
 *
 * Both arguments are optional so a caller can still read everything: a full day
 * across all domains, or one domain across a chosen date. They compose.
 *
 * `date::text` for the same reason as `findDailySet` in observations.ts: `pg`
 * turns a DATE into a local-time Date, which reads back a day early west of UTC.
 */
export const fetchObservationsForDate = async (
  date: string | null = null,
  marketDomain: string | null = null,
): Promise<ObservationDay> => {
  const { rows: dayRows } = await pool.query<{ day: string }>(
    `
      SELECT ${date === null ? "CURRENT_DATE" : "$1::date"}::text AS day;
    `,
    date === null ? [] : [date],
  );

  // `SELECT <expr>` always returns exactly one row, so an empty result would mean
  // the expression failed rather than that the day has no observations.
  const resolvedDate = dayRows[0]?.day;

  if (resolvedDate === undefined) {
    throw new Error(
      `Could not resolve a date to query weather.observations with. Requested ${JSON.stringify(date)}.`,
    );
  }

  const values: unknown[] = [resolvedDate];
  const conditions = ["date = $1::date"];

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

  return { date: resolvedDate, marketDomain, rows: rows as StoredObservation[] };
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
