import type { Request, Response } from "express";
import { z } from "zod";

import pool from "../config/database.js";

// --------------------------------------------------
// Generic indicator data API
// --------------------------------------------------
//
// The frontend should not need one endpoint per indicator. It asks for a list
// of indicators (by name, series id, or catalogue id) and receives each one's
// metadata, current row, and historical rows.
//
// The database stores each indicator's data in a table named after the series,
// not after the indicator. The `series_id` column is the join key. This module
// discovers those tables from `information_schema`, caches the catalogue for
// the life of the process, and validates every identifier before interpolating
// it into SQL.
// --------------------------------------------------

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_INDICATORS_PER_REQUEST = 25;
const MAX_HISTORY_LIMIT = 10_000;

const NUMERIC_TYPES = new Set([
  "smallint",
  "integer",
  "bigint",
  "decimal",
  "numeric",
  "real",
  "double precision",
]);

const isValidDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const dateSchema = z
  .string()
  .regex(DATE_PATTERN, "must use YYYY-MM-DD")
  .refine(isValidDate, "must be a valid calendar date");

export const fetchIndicatorDataSchema = z
  .object({
    indicators: z
      .array(z.string().trim().min(1).max(200))
      .min(1, "indicators must contain at least one name or series id")
      .max(
        MAX_INDICATORS_PER_REQUEST,
        `indicators must contain at most ${MAX_INDICATORS_PER_REQUEST} entries`,
      ),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    historyLimit: z.number().int().min(1).max(MAX_HISTORY_LIMIT).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must be on or before to",
    path: ["from"],
  });

type FetchIndicatorDataInput = z.infer<typeof fetchIndicatorDataSchema>;

interface IndicatorRow {
  id: string;
  name: string;
  domain: string;
  category: string;
  description: string;
  source: string;
  series_id: string;
  native_time_unit: string;
  native_frequency: string;
  native_aggregation: string;
  unit: string;
  use: string;
  purpose: string;
  significance: string;
  relation_tags: string[];
  status: "active" | "inactive";
}

interface ColumnRow {
  table_schema: "current" | "historical";
  table_name: string;
  column_name: string;
  data_type: string;
  ordinal_position: number;
}

interface TableInfo {
  schema: "current" | "historical";
  table: string;
  columns: ColumnRow[];
}

interface IndicatorLookup {
  indicators: IndicatorRow[];
  bySeriesId: Map<string, IndicatorRow>;
  byId: Map<string, IndicatorRow>;
  byName: Map<string, IndicatorRow>;
}

interface TableCatalog {
  currentBySeries: Map<string, TableInfo[]>;
  historicalBySeries: Map<string, TableInfo[]>;
}

const quoteIdentifier = (value: string): string => {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`unsafe SQL identifier: ${JSON.stringify(value)}`);
  }

  return `"${value}"`;
};

const tableReference = (table: TableInfo): string =>
  `${table.schema}.${quoteIdentifier(table.table)}`;

/**
 * Builds a SELECT list that returns dates as `YYYY-MM-DD` and numeric values as
 * JSON numbers. PostgreSQL otherwise returns DATE as a Date object and NUMERIC
 * as a string, both of which force avoidable handling in the frontend.
 */
const buildSelectList = (table: TableInfo): string =>
  table.columns
    .map((column) => {
      const identifier = quoteIdentifier(column.column_name);

      if (column.data_type === "date") {
        return `${identifier}::text AS ${identifier}`;
      }

      if (NUMERIC_TYPES.has(column.data_type)) {
        return `${identifier}::float8 AS ${identifier}`;
      }

      return identifier;
    })
    .join(", ");

const loadIndicatorLookup = async (): Promise<IndicatorLookup> => {
  const result = await pool.query<IndicatorRow>(
    `
      SELECT
        id, name, domain, category, description, source, series_id,
        native_time_unit, native_frequency, native_aggregation, unit,
        use, purpose, significance, relation_tags, status
      FROM indicator.indicators
      WHERE status = 'active'
      ORDER BY name
    `,
  );

  const indicators = result.rows;

  return {
    indicators,
    bySeriesId: new Map(indicators.map((indicator) => [indicator.series_id, indicator])),
    byId: new Map(indicators.map((indicator) => [indicator.id, indicator])),
    byName: new Map(indicators.map((indicator) => [indicator.name.toLowerCase(), indicator])),
  };
};

const loadTableCatalog = async (): Promise<TableCatalog> => {
  const client = await pool.connect();

  try {
    const columnResult = await client.query<ColumnRow>(
      `
        SELECT
          table_schema, table_name, column_name, data_type, ordinal_position
        FROM information_schema.columns
        WHERE table_schema IN ('current', 'historical')
        ORDER BY table_schema, table_name, ordinal_position
      `,
    );

    const tableMap = new Map<string, TableInfo>();

    for (const row of columnResult.rows) {
      if (row.table_schema !== "current" && row.table_schema !== "historical") {
        continue;
      }

      if (!IDENTIFIER_PATTERN.test(row.table_name)) {
        throw new Error(`unsafe table name in ${row.table_schema}: ${row.table_name}`);
      }

      if (!IDENTIFIER_PATTERN.test(row.column_name)) {
        throw new Error(
          `unsafe column name in ${row.table_schema}.${row.table_name}: ${row.column_name}`,
        );
      }

      const key = `${row.table_schema}.${row.table_name}`;
      const table: TableInfo = tableMap.get(key) ?? {
        schema: row.table_schema,
        table: row.table_name,
        columns: [],
      };

      table.columns.push(row);
      tableMap.set(key, table);
    }

    const tablesBySchema = new Map<"current" | "historical", TableInfo[]>([
      ["current", []],
      ["historical", []],
    ]);

    for (const table of tableMap.values()) {
      if (table.columns.some((column) => column.column_name === "series_id")) {
        tablesBySchema.get(table.schema)?.push(table);
      }
    }

    const loadSeriesOwners = async (
      schema: "current" | "historical",
      tables: TableInfo[],
    ): Promise<Map<string, TableInfo[]>> => {
      const owners = new Map<string, TableInfo[]>();

      if (tables.length === 0) {
        return owners;
      }

      const union = tables
        .map(
          (table) =>
            `SELECT '${table.table}'::text AS table_name, series_id FROM ${tableReference(table)} GROUP BY series_id`,
        )
        .join("\nUNION ALL\n");

      const result = await client.query<{ table_name: string; series_id: string }>(
        `SELECT DISTINCT table_name, series_id FROM (${union}) AS series_owners`,
      );

      for (const row of result.rows) {
        const table = tableMap.get(`${schema}.${row.table_name}`);

        if (!table) {
          continue;
        }

        const list = owners.get(row.series_id) ?? [];
        list.push(table);
        owners.set(row.series_id, list);
      }

      return owners;
    };

    const currentBySeries = await loadSeriesOwners("current", tablesBySchema.get("current") ?? []);
    const historicalBySeries = await loadSeriesOwners(
      "historical",
      tablesBySchema.get("historical") ?? [],
    );

    return { currentBySeries, historicalBySeries };
  } finally {
    client.release();
  }
};

let indicatorLookupPromise: Promise<IndicatorLookup> | null = null;
let tableCatalogPromise: Promise<TableCatalog> | null = null;

const getIndicatorLookup = (): Promise<IndicatorLookup> => {
  if (!indicatorLookupPromise) {
    indicatorLookupPromise = loadIndicatorLookup().catch((error: unknown) => {
      indicatorLookupPromise = null;
      throw error;
    });
  }

  return indicatorLookupPromise;
};

const getTableCatalog = (): Promise<TableCatalog> => {
  if (!tableCatalogPromise) {
    tableCatalogPromise = loadTableCatalog().catch((error: unknown) => {
      tableCatalogPromise = null;
      throw error;
    });
  }

  return tableCatalogPromise;
};

const toIndicatorResponse = (indicator: IndicatorRow) => ({
  id: indicator.id,
  name: indicator.name,
  seriesId: indicator.series_id,
  domain: indicator.domain,
  category: indicator.category,
  description: indicator.description,
  source: indicator.source,
  nativeTimeUnit: indicator.native_time_unit,
  nativeFrequency: indicator.native_frequency,
  nativeAggregation: indicator.native_aggregation,
  unit: indicator.unit,
  use: indicator.use,
  purpose: indicator.purpose,
  significance: indicator.significance,
  relationTags: indicator.relation_tags,
  status: indicator.status,
});

const resolveIndicator = (lookup: IndicatorLookup, value: string): IndicatorRow | null =>
  lookup.bySeriesId.get(value) ??
  lookup.byId.get(value) ??
  lookup.byName.get(value.toLowerCase()) ??
  null;

const readCurrent = async (table: TableInfo, seriesId: string) => {
  const select = buildSelectList(table);

  const result = await pool.query<Record<string, unknown>>(
    `
      SELECT ${select}
      FROM ${tableReference(table)}
      WHERE series_id = $1
      ORDER BY observed_at DESC
      LIMIT 1
    `,
    [seriesId],
  );

  return result.rows[0] ?? null;
};

const readHistorical = async (
  table: TableInfo,
  seriesId: string,
  input: FetchIndicatorDataInput,
) => {
  const select = buildSelectList(table);

  // The inner query takes the newest N rows (or every row when no limit is
  // supplied), then the outer query restores chronological order.
  const result = await pool.query<Record<string, unknown>>(
    `
      SELECT *
      FROM (
        SELECT ${select}
        FROM ${tableReference(table)}
        WHERE series_id = $1
          AND ($2::date IS NULL OR date >= $2::date)
          AND ($3::date IS NULL OR date <= $3::date)
        ORDER BY date DESC
        LIMIT $4::int
      ) recent
      ORDER BY date ASC
    `,
    [seriesId, input.from ?? null, input.to ?? null, input.historyLimit ?? null],
  );

  return result.rows;
};

/**
 * Returns the indicator catalogue the frontend can request from.
 *
 * Only active indicators are listed, matching the rest of the data layer.
 */
export const listIndicators = async (_req: Request, res: Response) => {
  try {
    const lookup = await getIndicatorLookup();

    res.json({
      count: lookup.indicators.length,
      indicators: lookup.indicators.map((indicator) => ({
        id: indicator.id,
        name: indicator.name,
        seriesId: indicator.series_id,
        domain: indicator.domain,
        category: indicator.category,
      })),
    });
  } catch (error) {
    console.error("Indicator catalogue lookup failed:", error);
    res.status(500).json({ message: "Could not load the indicator catalogue" });
  }
};

/**
 * Fetches metadata, the current row, and historical rows for a list of
 * indicators. Each item may be a name, series id, or catalogue id.
 *
 * Unknown names are reported in `missing`; valid entries still return data.
 */
export const fetchIndicatorData = async (req: Request, res: Response) => {
  const input = req.body as FetchIndicatorDataInput;

  try {
    const [lookup, tableCatalog] = await Promise.all([getIndicatorLookup(), getTableCatalog()]);

    const requested = [...new Set(input.indicators.map((value) => value.trim()).filter(Boolean))];

    const resolved: IndicatorRow[] = [];
    const missing: string[] = [];
    const seenSeriesIds = new Set<string>();

    for (const value of requested) {
      const indicator = resolveIndicator(lookup, value);

      if (!indicator) {
        missing.push(value);
        continue;
      }

      // A name and its series id can both resolve to the same indicator.
      if (!seenSeriesIds.has(indicator.series_id)) {
        seenSeriesIds.add(indicator.series_id);
        resolved.push(indicator);
      }
    }

    const indicators = await Promise.all(
      resolved.map(async (indicator) => {
        const currentTable = tableCatalog.currentBySeries.get(indicator.series_id)?.[0] ?? null;
        const historicalTable =
          tableCatalog.historicalBySeries.get(indicator.series_id)?.[0] ?? null;

        const [current, historical] = await Promise.all([
          currentTable ? readCurrent(currentTable, indicator.series_id) : Promise.resolve(null),
          historicalTable
            ? readHistorical(historicalTable, indicator.series_id, input)
            : Promise.resolve([]),
        ]);

        return {
          indicator: toIndicatorResponse(indicator),
          current,
          historical,
          currentTable: currentTable?.table ?? null,
          historicalTable: historicalTable?.table ?? null,
        };
      }),
    );

    res.json({
      requested: requested.length,
      found: indicators.length,
      missing,
      indicators,
    });
  } catch (error) {
    console.error("Indicator data fetch failed:", error);
    res.status(500).json({ message: "Could not fetch indicator data" });
  }
};
