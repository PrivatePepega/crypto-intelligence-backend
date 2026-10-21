import pool from "../../../config/database.js";

/**
 * Copies yesterday's `global_overview_data` into today's climate brief.
 *
 * The Global Overview has its own pipeline. Until that pipeline writes today's
 * version, today's cell starts as yesterday's brief so downstream stages have a
 * global baseline to work from.
 *
 * The copy is skipped when:
 * - yesterday's cell is empty, because there is nothing to carry forward, or
 * - today's cell already has content, because a real global brief must not be
 *   overwritten by a stale copy.
 *
 * @param yesterdayIntelligenceSetId The set to read the global brief from.
 * @param climateIntelligenceSetId The set to write the global brief into.
 */
export async function carryForwardGlobalOverview(
  yesterdayIntelligenceSetId: string,
  climateIntelligenceSetId: string,
): Promise<void> {
  const sourceResult = await pool.query<{ global_overview_data: unknown }>(
    `
      SELECT global_overview_data
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [yesterdayIntelligenceSetId],
  );

  const source = sourceResult.rows[0];

  if (!source) {
    throw new Error(
      `No climate brief found for yesterday's intelligence set ${yesterdayIntelligenceSetId}.`,
    );
  }

  if (source.global_overview_data === null || source.global_overview_data === undefined) {
    console.warn(
      "[Global Overview] Yesterday's global_overview_data is empty; nothing to carry forward.",
    );
    return;
  }

  const todayResult = await pool.query<{ is_empty: boolean }>(
    `
      SELECT (
        global_overview_data IS NULL
        OR jsonb_typeof(global_overview_data) = 'null'
      ) AS is_empty
      FROM climate.climate_briefs
      WHERE intelligence_sets_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [climateIntelligenceSetId],
  );

  const today = todayResult.rows[0];

  if (!today) {
    throw new Error(`No climate brief found for intelligence set ${climateIntelligenceSetId}.`);
  }

  if (!today.is_empty) {
    console.log(
      "[Global Overview] Today's global_overview_data is already populated; leaving it unchanged.",
    );
    return;
  }

  const serialized = JSON.stringify(source.global_overview_data);

  const response = await pool.query(
    `
      UPDATE climate.climate_briefs
      SET global_overview_data = $1::jsonb
      WHERE intelligence_sets_id = $2::uuid
    `,
    [serialized, climateIntelligenceSetId],
  );

  if (response.rowCount === 0) {
    throw new Error(`No climate brief found for intelligence set ${climateIntelligenceSetId}`);
  }

  const chars =
    typeof source.global_overview_data === "string"
      ? source.global_overview_data.length
      : serialized.length;

  console.log(
    `[Global Overview] Carried forward ${chars} chars from yesterday's ` +
      `intelligence set ${yesterdayIntelligenceSetId}.`,
  );
}
