import fs from "node:fs/promises";
import path from "node:path";

import pool from "../config/database.js";

/**
 * Exports every column except `relation_tags` and `embedding` from the
 * `indicator.indicators` table (created by database/sql/createIndicatorTables.ts)
 * into `indicatorList.json`.
 *
 * Output shape:
 *   [
 *     {
 *       "id": "wti",
 *       "name": "WTI Crude Oil",
 *       "domain": "Commodities",
 *       "category": "Energy",
 *       ...
 *       "series_id": "WTI",
 *       ...
 *     },
 *     ...
 *   ]
 */
const OUTPUT_PATH = path.resolve(process.cwd(), "indicatorList.json");

const exportIndicatorList = async () => {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT
        id, name, domain, category, description, source, series_id,
        native_time_unit, native_frequency, native_aggregation, unit,
        use, purpose, significance, status
      FROM indicator.indicators ORDER BY name`,
  );

  const indicators = result.rows;

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(indicators, null, 2) + "\n");

  console.log(`Wrote ${indicators.length} indicators to ${OUTPUT_PATH}`);
};

exportIndicatorList()
  .catch((error) => {
    console.error("Export indicator list failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
