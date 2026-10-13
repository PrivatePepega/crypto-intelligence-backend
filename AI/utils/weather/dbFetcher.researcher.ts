import pool from "../../../config/database.js";

import type { DailySet } from "./observations.js";

// --------------------------------------------------
// Researcher
// --------------------------------------------------
//
// The research queue and the research results, against weather.observations and
// weather.research. One module per agent, matching dbFetcher.triage.ts.
//
// Reads only what Triage promoted: an observation reaches this agent because
// something already decided it deserves research, and re-deciding that here would
// quietly change what the pipeline researches.
// --------------------------------------------------

/** One queued observation: a row Triage marked `research_enabled`. */
export type ResearchTarget = {
  id: string;
  date: string;
  market_domain: string;
  type: string;
  observation: string;
  research_enabled: boolean;
};

/** One research record as stored in weather.research. */
export type StoredResearch = {
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

/**
 * The set's observations that Triage marked for research, oldest first.
 *
 * Scoped by `intelligence_set_id` rather than by `date`, for the same reason
 * triage is: the foreign key is what ties a row to a day's work, while
 * `weather.observations.date` is an unconstrained copy of the set's date.
 *
 * `research_enabled = TRUE` is the queue. It is a label Triage already set and
 * nothing here clears it, so the queue is stable across runs and a research pass
 * does not reshuffle what the next pass will pick up.
 *
 * `NOT EXISTS` is what makes re-running cheap and safe. weather.research has no
 * unique constraint on `observation_id`, so without it a second run would research
 * every observation again and stack a second row on each - spending the tokens a
 * second time to produce a duplicate. With it a repeat run finds only what the
 * previous one did not finish, which is also the right way to recover after a
 * failure partway through.
 *
 * @param marketDomain `null` queues every enabled domain in the set.
 */
export const fetchResearchQueue = async (
  intelligenceSet: DailySet,
  marketDomain: string | null = null,
): Promise<ResearchTarget[]> => {
  const values: unknown[] = [intelligenceSet.id];

  const conditions = [
    "o.intelligence_set_id = $1::uuid",
    "o.research_enabled = TRUE",
    `NOT EXISTS (
      SELECT 1
      FROM weather.research AS r
      WHERE r.intelligence_set_id = o.intelligence_set_id
        AND r.observation_id = o.id
    )`,
  ];

  if (marketDomain !== null) {
    values.push(marketDomain);
    conditions.push(`o.market_domain = $${values.length}`);
  }

  const { rows } = await pool.query(
    `
      SELECT
        o.id,
        o.date::text AS date,
        o.market_domain,
        o.type,
        o.observation,
        o.research_enabled
      FROM weather.observations AS o
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY o.created_at ASC;
    `,
    values,
  );

  return rows as ResearchTarget[];
};

/** One finalized research record, paired with the observation it researched. */
export type ResearchToStore = {
  observation: ResearchTarget;
  /** The record already serialized, so the caller controls the stored shape. */
  research: string;
};

/**
 * Stores a batch of research records, one row each.
 *
 * Every entry becomes its own row, so each record stays individually addressable
 * against the observation it belongs to rather than being packed into one blob.
 *
 * One statement for the whole batch: a day is tens of rows, so the round-trip
 * saving is worth more than a loop, and a single statement is atomic without an
 * explicit transaction - either every record lands or none does.
 *
 * `observation` is copied from the observation row rather than from the model's
 * own echo of it: the row is the authoritative text, and a paraphrase written into
 * a second column would let the two drift apart unnoticed.
 *
 * No `ON CONFLICT`: weather.research has no unique constraint, so a record that
 * already exists would gain a second row. The queue excludes those.
 *
 * @returns The ids of the rows written, in the order supplied.
 */
export const insertResearchBatch = async (
  intelligenceSet: DailySet,
  entries: ResearchToStore[],
): Promise<string[]> => {
  if (entries.length === 0) return [];

  // Seven bound values per entry: the set, the observation it belongs to, the
  // four observation columns copied across, and the record itself.
  const VALUES_PER_ENTRY = 7;

  const values: unknown[] = [];

  const tuples = entries.map((entry, index) => {
    const first = index * VALUES_PER_ENTRY + 1;

    values.push(
      intelligenceSet.id,
      entry.observation.id,
      entry.observation.date,
      entry.observation.market_domain,
      entry.observation.type,
      entry.observation.observation,
      entry.research,
    );

    const placeholders = Array.from(
      { length: VALUES_PER_ENTRY },
      (_, offset) => `$${first + offset}`,
    );

    return `(${placeholders.join(", ")})`;
  });

  const { rows } = await pool.query(
    `
      INSERT INTO weather.research (
        intelligence_set_id, observation_id, date, market_domain, type, observation, research
      )
      VALUES ${tuples.join(",\n        ")}
      RETURNING id;
    `,
    values,
  );

  return (rows as { id: string }[]).map((row) => row.id);
};

/**
 * Every research record filed under one intelligence set, oldest first.
 *
 * Read after a research pass so the results can be written to a JSON artifact for
 * review, and so a run log can be checked against what actually landed in the
 * database.
 */
export const fetchResearchForSet = async (intelligenceSet: DailySet): Promise<StoredResearch[]> => {
  const { rows } = await pool.query(
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
      WHERE intelligence_set_id = $1::uuid
      ORDER BY created_at ASC;
    `,
    [intelligenceSet.id],
  );

  return rows as StoredResearch[];
};

/**
 * Deletes every research record filed under one intelligence set.
 *
 * Must run before the observations are deleted: `weather.research.observation_id` is
 * `ON DELETE RESTRICT`, so deleting an observation that still has research fails
 * rather than cascading.
 *
 * @returns How many rows were removed.
 */
export const deleteResearchForSet = async (intelligenceSet: DailySet): Promise<number> => {
  const { rowCount } = await pool.query(
    `DELETE FROM weather.research WHERE intelligence_set_id = $1::uuid;`,
    [intelligenceSet.id],
  );

  return rowCount ?? 0;
};
