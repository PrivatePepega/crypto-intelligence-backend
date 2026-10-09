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

/**
 * Stores one research record against the observation it researched.
 *
 * `observation` is copied from the observation row rather than from the model's
 * own echo of it: the row is the authoritative text, and a paraphrase written
 * into a second column would let the two drift apart unnoticed.
 *
 * No `ON CONFLICT`: weather.research has no unique constraint, so a repeat pass
 * writes a second row for the same observation. Deduplicating which record wins
 * is the caller's decision, not this function's.
 *
 * @returns The id of the row written.
 */
export const insertResearch = async (
  intelligenceSet: DailySet,
  observation: ResearchTarget,
  research: string,
): Promise<string> => {
  const { rows } = await pool.query(
    `
      INSERT INTO weather.research (
        intelligence_set_id, observation_id, date, market_domain, type, observation, research
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id;
    `,
    [
      intelligenceSet.id,
      observation.id,
      observation.date,
      observation.market_domain,
      observation.type,
      observation.observation,
      research,
    ],
  );

  return rows[0].id;
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
