import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodingForModel } from "js-tiktoken";

import pool from "../../config/database.js";
import { TOKENIZED_FIELDS } from "./exposeIndicators.js";

/**
 * Exports the live `current` dataset tables to JSON, with the indicator each one
 * belongs to.
 *
 * Source: the `current` schema in PostgreSQL - one table per indicator holding
 * that indicator's latest observation set.
 *
 * ## Shape of the schema
 *
 * Measured 2026-10-05: 105 tables, 98 populated, 7 empty, and **every populated
 * table resolves to an indicator**. That link is the table's own `series_id`
 * column, which is the foreign key declared in `database/sql/current/*.sql`:
 *
 *   current.btc_spot_etf.series_id = 'spot_etf_btc'
 *     -> indicator.indicators.series_id = 'spot_etf_btc'
 *        -> id 'spot_etf_bitcoin', name 'Bitcoin Spot ETF Market'
 *
 * Note it is `series_id`, not the table's `indicator` column, that joins to
 * `indicators.series_id`. Joining on `indicators.id` returns nothing.
 *
 * Each populated table holds exactly one row, so an entry is a single
 * observation set rather than a series.
 *
 * ## Token counting
 *
 * `tokenCount` covers the same descriptive fields as `exposeIndicators.ts`,
 * plus the current row itself - i.e. the full payload an indicator would
 * contribute to a prompt. The field list is imported rather than repeated so
 * the two exports stay directly comparable.
 *
 * Run: npx tsx utils/AI/currentDataExpose.ts
 */

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Resolved from this module's location, not hardcoded to a machine path. */
const OUTPUT_DIR = path.resolve(MODULE_DIR, "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "currentData.json");

/**
 * Created once at module load, not per table.
 *
 * gpt-4o / o200k_base matches `utils/tokenCounter.ts` and `exposeIndicators.ts`,
 * so token counts from all three are on the same scale.
 */
const tokenizer = encodingForModel("gpt-4o");

/** One exported table: its indicator, its current values, and their cost. */
export type CurrentDataEntry = {
  /** Physical table in the `current` schema. */
  table: string;
  /** `indicator.indicators.id` for this table. */
  indicatorId: string;
  /** The join key the current tables carry. */
  seriesId: string;
  /** Descriptive metadata, same field set `exposeIndicators.ts` tokenizes. */
  indicator: Record<string, string>;
  /** The table's rows. One observation set per populated table. */
  data: Record<string, unknown>[];
  /** Tokens for `indicator` + `data` serialized together. */
  tokenCount: number;
};

export type CurrentDataExport = {
  generatedAt: string;
  source: "current";
  /** Every table in the schema, populated or not. */
  tableCount: number;
  populatedTableCount: number;
  emptyTableCount: number;
  tokenization: {
    model: string;
    encoding: string;
    /** Descriptive indicator fields included in every count. */
    fields: readonly string[];
    /** The current row is always included as well. */
    includesData: boolean;
    totalTokens: number;
  };
  /** Tables with no rows. Listed rather than dropped silently. */
  emptyTables: string[];
  /** Populated tables whose `series_id` matched no indicator. */
  unmatchedTables: string[];
  /** `series_id` values claimed by more than one table. */
  sharedSeriesIds: { seriesId: string; tables: string[] }[];
  currentData: Record<string, CurrentDataEntry>;
};

/** Indicator columns needed for the tokenized projection. */
const INDICATOR_SELECT = `
  id, name, description, native_time_unit, native_frequency,
  unit, use, purpose, significance, series_id
`;

/** camelCase projection of the indicator fields listed in TOKENIZED_FIELDS. */
const toIndicatorPayload = (
  row: Record<string, unknown>,
): Record<string, string> => {
  const source: Record<string, unknown> = {
    name: row.name,
    description: row.description,
    nativeTimeUnit: row.native_time_unit,
    nativeFrequency: row.native_frequency,
    unit: row.unit,
    use: row.use,
    purpose: row.purpose,
    significance: row.significance,
  };

  const payload: Record<string, string> = {};

  for (const field of TOKENIZED_FIELDS) {
    const value = source[field];

    payload[field] = typeof value === "string" ? value : "";
  }

  return payload;
};

/**
 * Measures an indicator plus its current row.
 *
 * Both halves are counted together because they would travel together in a
 * prompt, and counted from their serialized form so the figure reflects the real
 * payload rather than a character estimate.
 */
const countTokens = (
  indicator: Record<string, string>,
  data: Record<string, unknown>[],
): number =>
  tokenizer.encode(JSON.stringify({ indicator, data })).length;

export const exposeCurrentData = async (): Promise<CurrentDataExport> => {
  const client = await pool.connect();

  try {
    const tables = await client.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'current'
        ORDER BY table_name
      `,
    );

    const currentData: Record<string, CurrentDataEntry> = {};

    const emptyTables: string[] = [];

    const unmatchedTables: string[] = [];

    const seriesOwners = new Map<string, string[]>();

    let totalTokens = 0;

    for (const { table_name: table } of tables.rows) {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT * FROM current."${table}"`,
      );

      if (rows.rows.length === 0) {
        emptyTables.push(table);
        continue;
      }

      const seriesIds = [
        ...new Set(
          rows.rows
            .map((row) => row.series_id)
            .filter((value): value is string => typeof value === "string"),
        ),
      ];

      if (seriesIds.length === 0) {
        unmatchedTables.push(table);
        continue;
      }

      const indicator = await client.query<Record<string, unknown>>(
        `
          SELECT ${INDICATOR_SELECT}
          FROM indicator.indicators
          WHERE series_id = ANY($1::text[])
          ORDER BY id
          LIMIT 1
        `,
        [seriesIds],
      );

      const found = indicator.rows[0];

      if (!found) {
        unmatchedTables.push(table);
        continue;
      }

      const seriesId = String(found.series_id);

      const owners = seriesOwners.get(seriesId) ?? [];

      owners.push(table);
      seriesOwners.set(seriesId, owners);

      const indicatorPayload = toIndicatorPayload(found);

      const data = rows.rows;

      const tokenCount = countTokens(indicatorPayload, data);

      totalTokens += tokenCount;

      currentData[table] = {
        table,
        indicatorId: String(found.id),
        seriesId,
        indicator: indicatorPayload,
        data,
        tokenCount,
      };
    }

    const sharedSeriesIds = [...seriesOwners.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([seriesId, tables_]) => ({ seriesId, tables: tables_ }));

    const populatedTableCount = Object.keys(currentData).length;

    const data: CurrentDataExport = {
      generatedAt: new Date().toISOString(),
      source: "current",
      tableCount: tables.rows.length,
      populatedTableCount,
      emptyTableCount: emptyTables.length,
      tokenization: {
        model: "gpt-4o",
        encoding: "o200k_base",
        fields: TOKENIZED_FIELDS,
        includesData: true,
        totalTokens,
      },
      emptyTables,
      unmatchedTables,
      sharedSeriesIds,
      currentData,
    };

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    await fs.writeFile(OUTPUT_FILE, JSON.stringify(data, null, 2), "utf8");

    return data;
  } finally {
    client.release();
  }
};

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  exposeCurrentData()
    .then((data) => {
      console.log(`Exported current data`);
      console.log(`  tables    : ${data.tableCount}`);
      console.log(
        `  populated : ${data.populatedTableCount}  (empty: ${data.emptyTableCount})`,
      );
      console.log(`  unmatched : ${data.unmatchedTables.length}`);
      console.log(`  shared series ids : ${data.sharedSeriesIds.length}`);
      console.log(
        `  tokens    : ${data.tokenization.totalTokens.toLocaleString()} total ` +
          `(${data.tokenization.model} / ${data.tokenization.encoding})`,
      );
      console.log(`  -> ${path.relative(process.cwd(), OUTPUT_FILE)}`);
    })
    .catch((error: unknown) => {
      console.error("Current data export failed:", error);
      process.exitCode = 1;
    });
}