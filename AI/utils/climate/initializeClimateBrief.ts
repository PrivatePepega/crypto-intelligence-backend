import pool from "../../../config/database.js";

// --------------------------------------------------
// Climate Brief Initialization
// --------------------------------------------------
//
// Creates the climate_briefs row the AI pipeline writes into. Two shapes:
//
// - `initializeEmptyClimateBrief` — identity columns only. Every payload column
//   (the `_data` / `_relevance_router` / `_researcher` / `_analysis` cells) stays
//   NULL, and the pipeline fills them as it runs. Use this when the brief should be
//   built entirely from the day's intelligence rather than seeded from the
//   initializer files.
//
// The table has no unique constraint on (intelligence_sets_id, date) beyond the
// primary key, so this uses ON CONFLICT (intelligence_sets_id) DO UPDATE to stay
// idempotent: a re-run does not duplicate the row, and it does not overwrite
// columns the pipeline has already populated — they are simply not in the SET
// clause.
// --------------------------------------------------


/**
 * Initialize an empty climate brief for a given intelligence set.
 *
 * Creates a row with only the identity columns (intelligence_sets_id, date) and
 * leaves every payload column NULL. The relevance router and later stages
 * populate the `_data` columns as they run.
 */
export async function initializeEmptyClimateBrief(intelligenceSetId: string): Promise<string> {
  // Check if the climate brief already exists for this intelligence set
  const existingResult = await pool.query(
    `SELECT uuid FROM climate.climate_briefs WHERE intelligence_sets_id = $1::uuid LIMIT 1`,
    [intelligenceSetId],
  );

  if (existingResult.rows.length > 0) {
    // Already exists - don't initialize again
    return existingResult.rows[0].uuid as string;
  }

  const date = new Date().toISOString().split("T")[0] ?? new Date().toISOString();

  const { rows } = await pool.query(
    `
      INSERT INTO climate.climate_briefs (intelligence_sets_id, date)
      VALUES ($1::uuid, $2::date)
      RETURNING uuid
    `,
    [intelligenceSetId, date],
  );

  return rows[0].uuid as string;
}
