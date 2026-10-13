/**
 * Reads a database table into a readable JSON snapshot under AI/data/.
 *
 * The snapshot exists to be read: by a person checking what a run stored, or by
 * an assistant reviewing what the database actually holds.
 *
 *   npx tsx AI/utils/dbFetcher.observer.ts
 *
 * Read-only by construction. The only statement is a SELECT.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../../config/database.js";

import { AGENT_RUN_LOG_DIR, toPathSegment, toReadableJson } from "../logger.js";

import type { DailySet } from "./observations.js";

// --------------------------------------------------
// Paths
// --------------------------------------------------

/**
 * Where observation snapshots are written, relative to AI/data.
 *
 * Declared here rather than beside the dump function because DATABASE_INPUT below
 * reads it, and `const` is not hoisted - a declaration further down would be in
 * its temporal dead zone when the config object is built.
 */
const INJECTED_SNAPSHOT_DIR = path.join("database Fetcher", "weather", "observations");

// --------------------------------------------------
// Database input
// --------------------------------------------------
//
// This block is the part meant to be edited. Everything below is derived from it,
// so changing what is fetched means changing it here and nothing else.
//
// Every field is a string, a number or null. A null filter is dropped from the
// query rather than matched against null, so leaving one null means "no filter"
// rather than "rows where the column is null".

export type ObservationsInput = {
  /** `schema.table`, or a bare `table` if it is on the search path. */
  table: string;

  /**
   * Columns to select, in output order.
   *
   * An entry may carry a cast and an alias - `date::text AS date`. The cast is
   * how a DATE reads back correctly: `pg` returns one as a local-time Date, which
   * serializes a day early west of UTC.
   */
  columns: string[];

  /** Equality filters against weather.observations. `null` disables one. */
  filters: {
    /** Matches `market_domain`. */
    marketDomain: string | null;
    /** Matches `type`. */
    type: string | null;
    /** Matches `date`, as `YYYY-MM-DD`. */
    date: string | null;
  };

  /** Column to sort by. */
  orderBy: string;

  /** `ASC` or `DESC`. */
  direction: "ASC" | "DESC";

  /** Ceiling on returned rows. */
  limit: number;

  /** Directory under AI/data to write into. */
  outputDirectory: string;

  /** File name prefix; the fetch timestamp is appended. */
  filePrefix: string;
};

export const DATABASE_INPUT: ObservationsInput = {
  table: "weather.observations",

  columns: [
    "id",
    "intelligence_set_id",
    "date::text AS date",
    "market_domain",
    "type",
    "observation",
    "research_enabled",
    "created_at",
  ],

  filters: {
    marketDomain: null,
    type: null,
    date: null,
  },

  orderBy: "created_at",

  direction: "DESC",

  limit: 500,

  // Points at the same folder dumpObservationsForSet writes to, so a hand-run
  // snapshot and a pipeline snapshot land together instead of creating a second
  // tree under weather/.
  outputDirectory: INJECTED_SNAPSHOT_DIR,

  filePrefix: "observations",
};

// --------------------------------------------------
// Validation
// --------------------------------------------------

/** A bare SQL name. */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

/** A bare name, optionally cast (`::text`) and optionally aliased (`AS date`). */
const SELECT_ITEM = /^[a-z_][a-z0-9_]*(::[a-z_][a-z0-9_]*)?(\s+AS\s+[a-z_][a-z0-9_]*)?$/i;

/** An optional `schema.` prefix followed by a bare name. */
const TABLE_NAME = /^(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*$/i;

/**
 * Checks a config field that will be interpolated into the statement.
 *
 * SQL identifiers cannot be parameterized, so these strings reach the query as
 * written. `DATABASE_INPUT` is edited in source rather than supplied at runtime,
 * so this guards against a typo becoming a broken or unintended query - not
 * against an attacker. Every value that *can* be bound is bound instead; see
 * {@link runSelect}.
 */
const requireSqlName = (value: string, field: string, pattern: RegExp): string => {
  const trimmed = value.trim();

  if (!pattern.test(trimmed)) {
    throw new Error(`DATABASE_INPUT.${field} is not a plain SQL name: ${JSON.stringify(value)}`);
  }

  return trimmed;
};

const requireDirection = (value: string): "ASC" | "DESC" => {
  const upper = value.trim().toUpperCase();

  if (upper !== "ASC" && upper !== "DESC") {
    throw new Error(
      `DATABASE_INPUT.direction must be ASC or DESC, received ${JSON.stringify(value)}`,
    );
  }

  return upper;
};

const requireLimit = (value: number): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `DATABASE_INPUT.limit must be a positive whole number, received ${JSON.stringify(value)}`,
    );
  }

  return value;
};

// --------------------------------------------------
// Query
// --------------------------------------------------

export type ObservationRow = Record<string, unknown>;

export type RunSelectResult = {
  rows: ObservationRow[];
  /** The statement as sent, with values left as placeholders. */
  statement: string;
  /** The bound values, in placeholder order. */
  values: unknown[];
};

/**
 * Builds and runs the SELECT described by `input`.
 *
 * Filter values and the limit are always bound as parameters. Names cannot be,
 * so those are validated by {@link requireSqlName} and interpolated only once
 * they pass.
 */
const runSelect = async (input: ObservationsInput): Promise<RunSelectResult> => {
  const table = requireSqlName(input.table, "table", TABLE_NAME);

  const columns = input.columns.map((column, index) =>
    requireSqlName(column, `columns[${index}]`, SELECT_ITEM),
  );

  if (columns.length === 0) {
    throw new Error("DATABASE_INPUT.columns is empty, so there is nothing to select.");
  }

  const orderBy = requireSqlName(input.orderBy, "orderBy", IDENTIFIER);
  const direction = requireDirection(input.direction);
  const limit = requireLimit(input.limit);

  const values: unknown[] = [];
  const conditions: string[] = [];

  const addEquality = (column: string, value: string | null): void => {
    if (value === null) {
      return;
    }

    values.push(value);

    conditions.push(`${column} = $${values.length}`);
  };

  addEquality("market_domain", input.filters.marketDomain);
  addEquality("type", input.filters.type);
  addEquality("date", input.filters.date);

  const where = conditions.length === 0 ? "" : `\n    WHERE ${conditions.join("\n      AND ")}`;

  const statement = `
    SELECT
      ${columns.join(",\n      ")}
    FROM ${table}${where}
    ORDER BY ${orderBy} ${direction}
    LIMIT $${values.length + 1};
  `;

  values.push(limit);

  const { rows } = await pool.query(statement, values);

  return { rows: rows as ObservationRow[], statement, values };
};

// --------------------------------------------------
// Artifact
// --------------------------------------------------

export type FetchedSnapshot = {
  /** Absolute path written. */
  filePath: string;
  /** Path from the repository root, forward-slashed. */
  relativeFile: string;
  /** How many rows the snapshot holds. */
  rowCount: number;
};

/** Timestamp safe as a Windows file name: colons are rejected in path segments. */
const fileStamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");

const writeSnapshot = async (
  input: ObservationsInput,
  result: RunSelectResult,
): Promise<FetchedSnapshot> => {
  const directory = path.join(AGENT_RUN_LOG_DIR, input.outputDirectory);

  await fs.mkdir(directory, { recursive: true });

  const filePath = path.join(directory, `${input.filePrefix}-${fileStamp()}.json`);

  const relativeFile = path.relative(process.cwd(), filePath).split(path.sep).join("/");

  const document = {
    source: input.table,

    fetchedAt: new Date().toISOString(),

    // The statement and its values, so a snapshot can be traced to the exact
    // query that produced it after DATABASE_INPUT has moved on.
    query: { statement: result.statement.trim(), values: result.values },

    rowCount: result.rows.length,

    rows: result.rows,
  };

  await fs.writeFile(filePath, toReadableJson(document), "utf8");

  return { filePath, relativeFile, rowCount: result.rows.length };
};

// --------------------------------------------------
// Injected snapshot
// --------------------------------------------------

/**
 * Writes `AI/data/database Fetcher/observations/observations-<date>-<domain>.json`.
 *
 * Called after an injection so the rows that were just written are readable
 * without a separate query, and so what the Observer produced is on disk even if
 * Triage and Research later fail.
 *
 * Scoped by `intelligence_set_id`, matching Triage's and Research's reads, so the
 * snapshot holds the set's rows rather than whatever else carries that date. Read
 * after the insert rather than built from the observations handed in, so it
 * records what actually committed: if the insert wrote fewer rows than it was
 * given, the difference is visible here instead of silently missing.
 *
 * Overwritten per date and domain, matching the triage record.
 *
 * Resolves to the path written, relative to the repository root.
 */
export const dumpObservationsForSet = async (
  intelligenceSet: DailySet,
  marketDomain: string,
): Promise<string> => {
  console.log(
    `[snapshot] Observations snapshot initialized for domain: ${marketDomain} - ` +
      `set ${intelligenceSet.id} (${intelligenceSet.set_date})`,
  );

  const columns = DATABASE_INPUT.columns.map((column, index) =>
    requireSqlName(column, `columns[${index}]`, SELECT_ITEM),
  );

  const { rows } = await pool.query(
    `
      SELECT
        ${columns.join(",\n        ")}
      FROM weather.observations
      WHERE intelligence_set_id = $1::uuid
        AND market_domain = $2
      ORDER BY created_at ASC;
    `,
    [intelligenceSet.id, marketDomain],
  );

  const directory = path.join(AGENT_RUN_LOG_DIR, INJECTED_SNAPSHOT_DIR);

  await fs.mkdir(directory, { recursive: true });

  const fileName = `observations-${intelligenceSet.set_date}-${toPathSegment(marketDomain)}.json`;

  const filePath = path.join(directory, fileName);

  const relativeFile = path.relative(process.cwd(), filePath).split(path.sep).join("/");

  const document = {
    date: intelligenceSet.set_date,

    marketDomain,

    intelligenceSetId: intelligenceSet.id,

    // Confirms the snapshot matches a set without querying the database. Every row
    // carries its own `intelligence_set_id`, so a divergence would be visible here.
    setIdAgreesWithEveryRow: (rows as ObservationRow[]).every(
      (row) => row.intelligence_set_id === intelligenceSet.id,
    ),

    writtenAt: new Date().toISOString(),

    rowCount: rows.length,

    rows,
  };

  await fs.writeFile(filePath, toReadableJson(document), "utf8");

  console.log(
    `[snapshot] Observations snapshot finalized for domain: ${marketDomain} - ` +
      `${rows.length} row(s) -> ${relativeFile}`,
  );

  return relativeFile;
};

// --------------------------------------------------
// Entry point
// --------------------------------------------------

/**
 * Reads the configured table and writes a snapshot of it.
 *
 * Resolves to where the snapshot landed. Throws rather than writing an empty file
 * if the query fails, so a broken snapshot never masquerades as an empty table.
 */
export const fetchDatabaseSnapshot = async (
  input: ObservationsInput = DATABASE_INPUT,
): Promise<FetchedSnapshot> => {
  const result = await runSelect(input);

  return await writeSnapshot(input, result);
};

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  fetchDatabaseSnapshot()
    .then((result) => {
      console.log(`Fetched ${result.rowCount} row(s) -> ${result.relativeFile}`);
    })
    .catch((error: unknown) => {
      console.error("Database fetch failed:", error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
