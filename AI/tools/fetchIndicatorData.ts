import { tool } from "ai";
import { z } from "zod";

import pool from "../../config/database.js";
import { createQueryEmbedding } from "../../utils/openai/createQueryEmbedding.js";

// --------------------------------------------------
// Fetch indicator data
// --------------------------------------------------
//
// Turns one historical indicator series into the shape an agent can read like a
// price chart.
//
// ## Why moving averages
//
// A human reads a chart and sees where the current price sits against the last
// few years. An agent cannot. The moving averages below are that chart: for 1,
// 3, 6, 12, 18, 24, 30, 36, 48 and 60 months they give the average level and
// the current value's distance from it, so the agent can say "above its 12-month
// average by 8%" instead of guessing from a single quote.
//
// ## How the series is found
//
// The vector search returns catalogue rows from indicator.indicators. Each row
// carries a `series_id`; the matching historical table is discovered from
// `information_schema` and cached for the process. A catalogue row without a
// historical table (currently the derived 10y-2y spread) is reported as
// `no_table`, not treated as an error.
//
// ## Which column is the series
//
// Historical tables are not uniform. Most have a single `value` column, OHLC
// tables have `close`, and the positioning / sentiment / ETF tables have many
// metrics. The rule is deterministic:
//
// - OHLC                -> close
// - a `value` column    -> value
// - a `close` column    -> close
// - known multi-metric  -> one documented primary metric per family
//
// The chosen column is returned as `metric` together with `availableMetrics`,
// so the agent can see exactly what it received. A caller that needs a different
// column (for example Binance `funding_rate`) can pass `metric` explicitly.
//
// ## How the windows are computed
//
// The window is anchored to the latest observation, not to today, because data
// can lag. For monthly and quarterly series the window is a count of native
// observations: N monthly rows, or ceil(N / 3) quarterly rows. For daily and
// weekly series it is the calendar window `date > latest - N months`, which
// keeps the answer correct without hard-coding 30-day or 4-week months.
//
// Only the widest requested window is fetched. The raw history is not
// returned; the averages and the current value are the intelligence.
// --------------------------------------------------

/** Indicators matched when the agent does not choose a count. */
const DEFAULT_LIMIT = 4;

/** The timeframes returned for every series, in months. */
export const TIMEFRAMES_MONTHS = [1, 3, 6, 12, 18, 24, 30, 36, 48, 60] as const;

/** The deepest lookback any timeframe needs. */
const MAX_LOOKBACK_MONTHS = Math.max(...TIMEFRAMES_MONTHS);

/** A bare SQL name. Historical table and column names are lower-case. */
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

/** The numeric SQL types a metric can have. */
const NUMERIC_TYPES = new Set([
  "smallint",
  "integer",
  "bigint",
  "decimal",
  "numeric",
  "real",
  "double precision",
]);

/**
 * Primary metric for the multi-metric tables, by family.
 *
 * These are the tables with no `value` or `close`. The choice is the single
 * series that best represents the indicator's stated subject:
 *
 * - IG sentiment: `net`, the net positioning the description names.
 * - Binance positioning: `global_long_short_ratio`, the headline ratio.
 * - CFTC: `open_interest`, the only total level in the table. Net positioning
 *   is split across trader categories, so picking one would be arbitrary.
 * - Spot ETF: `net_assets`, the level of capital in the vehicles.
 * - AAII: `bull_bear_spread`, the survey's net sentiment.
 * - Altcoin season: `index_value`.
 * - CMC general metrics: `total_market_cap`, the headline aggregate.
 */
const DEFAULT_METRICS: Record<string, string> = {
  aaii_sentiment: "bull_bear_spread",
  coinmarketcap_alt_season_fear_greed: "index_value",
  coinmarketcap_general_crypto_metric: "total_market_cap",
};

// --------------------------------------------------
// Types
// --------------------------------------------------

/** One historical observation. */
export type IndicatorPoint = {
  /** Observation day, `YYYY-MM-DD`. */
  date: string;
  /** The metric value on that day. */
  value: number;
};

/** One timeframe's moving average. */
export type MovingAverage = {
  /** The timeframe in months. */
  months: number;
  /** Mean of the observations in the window. */
  average: number;
  /** Current value minus `average`; positive means current is above. */
  difference: number;
  /**
   * `difference` as a percentage of `average`, or null when `average` is not
   * positive. A percentage of a zero or negative base is not meaningful, and
   * several of the multi-metric series (funding, net flows, net positioning)
   * can cross zero.
   */
  percentDifference: number | null;
  /** Whether the current value is above, below, or at the average. */
  position: "above" | "below" | "at";
  /** How many observations the average used. */
  observations: number;
};

/** The current value and its moving-average chart. */
export type MovingAverageSet = {
  /** The latest observation. */
  current: IndicatorPoint;
  /** Keyed by timeframe, e.g. `"12m"`. */
  movingAverages: Record<string, MovingAverage>;
  /** Number of observations fetched for the 60-month window. */
  observations: number;
  /** First and last observation in the fetched window. */
  range: { from: string; to: string };
};

/** One indicator, with its metadata and either its chart or a reason it has none. */
export type IndicatorIntelligence = {
  id: string;
  name: string;
  domain: string;
  category: string;
  description: string;
  source: string;
  seriesId: string;
  nativeTimeUnit: string;
  nativeFrequency: string;
  nativeAggregation: string;
  unit: string;
  significance: string;
  status: "ok" | "no_table" | "no_data" | "unsupported_metric";
  /** Why the indicator has no chart, or null when `status` is `ok`. */
  reason: string | null;
  /** The historical table read, or null when the series has no table. */
  historicalTable: string | null;
  /** The column charted, or null when no metric could be chosen. */
  metric: string | null;
  /** Every numeric column in the historical table. */
  availableMetrics: string[];
  /** The latest observation, or null when there is no data. */
  current: IndicatorPoint | null;
  /** The moving-average chart, or null when there is no data. */
  movingAverages: Record<string, MovingAverage> | null;
  /** Number of observations fetched for the 60-month window. */
  observations: number;
  /** First and last observation in the fetched window, or null. */
  range: { from: string; to: string } | null;
};

/** The tool's result payload. */
export type IndicatorDataResult = {
  /** True when the vector search matched at least one indicator. */
  found: boolean;
  query: string;
  indicators: IndicatorIntelligence[];
};

/** One row from indicator.indicators, reduced to the fields returned. */
type IndicatorRow = {
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
  significance: string;
};

/** One discovered historical table and its column sets. */
type HistoricalTable = {
  table: string;
  columns: Set<string>;
  numericColumns: Set<string>;
};

// --------------------------------------------------
// Moving averages
// --------------------------------------------------

/**
 * Subtracts calendar months from a `YYYY-MM-DD` day.
 *
 * The day is clamped to the target month's last day, so `2026-03-31` minus one
 * month is `2026-02-28` rather than rolling into March. `Date` is used only to
 * find that last day; the result is formatted back to a plain date.
 */
const subtractMonths = (date: string, months: number): string => {
  const [yearText, monthText, dayText] = date.split("-");

  if (!yearText || !monthText || !dayText) {
    throw new Error(`date is not in YYYY-MM-DD form: ${JSON.stringify(date)}`);
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const monthIndex = month - 1 - months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth + 1).padStart(
    2,
    "0",
  )}-${String(targetDay).padStart(2, "0")}`;
};

/**
 * Selects the observations in one timeframe.
 *
 * Monthly and quarterly series are counted in their native observations, which
 * is exactly what "the last 3 monthly readings" means. Daily and weekly series
 * use a calendar window, because a fixed 30-day month would drift over long
 * timeframes.
 */
const windowPoints = (
  points: readonly IndicatorPoint[],
  latestDate: string,
  months: number,
  nativeTimeUnit: string,
): readonly IndicatorPoint[] => {
  if (nativeTimeUnit === "month") {
    return points.slice(-months);
  }

  if (nativeTimeUnit === "quarter") {
    return points.slice(-Math.max(1, Math.ceil(months / 3)));
  }

  const cutoff = subtractMonths(latestDate, months);

  return points.filter((point) => point.date > cutoff && point.date <= latestDate);
};

/**
 * Builds the current value and its moving-average chart.
 *
 * Returns null for an empty series. The points do not need to be sorted.
 *
 * @param points The fetched observations.
 * @param nativeTimeUnit `day`, `week`, `month`, or `quarter`.
 */
export const computeMovingAverages = (
  points: readonly IndicatorPoint[],
  nativeTimeUnit: string,
): MovingAverageSet | null => {
  if (points.length === 0) {
    return null;
  }

  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const latest = ordered[ordered.length - 1];

  if (!latest) {
    return null;
  }

  const current: IndicatorPoint = { date: latest.date, value: latest.value };

  const movingAverages: Record<string, MovingAverage> = {};

  for (const months of TIMEFRAMES_MONTHS) {
    const window = windowPoints(ordered, current.date, months, nativeTimeUnit);

    if (window.length === 0) {
      continue;
    }

    const total = window.reduce((sum, point) => sum + point.value, 0);
    const average = total / window.length;
    const difference = current.value - average;

    movingAverages[`${months}m`] = {
      months,
      average,
      difference,
      percentDifference: average > 0 ? (difference / average) * 100 : null,
      position: difference > 0 ? "above" : difference < 0 ? "below" : "at",
      observations: window.length,
    };
  }

  const first = ordered[0];

  return {
    current,
    movingAverages,
    observations: ordered.length,
    range: {
      from: first?.date ?? current.date,
      to: current.date,
    },
  };
};

// --------------------------------------------------
// Historical catalogue
// --------------------------------------------------

/**
 * The `series_id -> historical table` map.
 *
 * Built once per process. `information_schema` knows the tables but not the
 * values they hold, so the map is assembled with one `UNION ALL` over the 105
 * historical tables. Each subquery groups by `series_id`, keeping the result
 * small even though PostgreSQL still scans the table.
 */
let historicalCatalogPromise: Promise<Map<string, HistoricalTable>> | null = null;

const loadHistoricalCatalog = async (): Promise<Map<string, HistoricalTable>> => {
  const { rows: tableRows } = await pool.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'historical'
        AND column_name = 'series_id'
      ORDER BY table_name;
    `,
  );

  const tables = tableRows.map((row) => row.table_name);

  for (const table of tables) {
    if (!IDENTIFIER_PATTERN.test(table)) {
      throw new Error(`historical table name is not a plain SQL name: ${JSON.stringify(table)}`);
    }
  }

  const { rows: columnRows } = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'historical'
      ORDER BY table_name, ordinal_position;
    `,
  );

  const columnsByTable = new Map<string, Set<string>>();
  const numericByTable = new Map<string, Set<string>>();

  for (const row of columnRows) {
    const columns = columnsByTable.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    columnsByTable.set(row.table_name, columns);

    if (NUMERIC_TYPES.has(row.data_type)) {
      const numeric = numericByTable.get(row.table_name) ?? new Set<string>();
      numeric.add(row.column_name);
      numericByTable.set(row.table_name, numeric);
    }
  }

  if (tables.length === 0) {
    return new Map();
  }

  const union = tables
    .map(
      (table) =>
        `SELECT '${table}' AS table_name, series_id FROM historical."${table}" GROUP BY series_id`,
    )
    .join("\nUNION ALL\n");

  const { rows: ownerRows } = await pool.query<{ table_name: string; series_id: string }>(
    `
      SELECT DISTINCT table_name, series_id
      FROM (${union}) AS all_series;
    `,
  );

  const catalog = new Map<string, HistoricalTable>();

  for (const row of ownerRows) {
    catalog.set(row.series_id, {
      table: row.table_name,
      columns: columnsByTable.get(row.table_name) ?? new Set<string>(),
      numericColumns: numericByTable.get(row.table_name) ?? new Set<string>(),
    });
  }

  return catalog;
};

const getHistoricalCatalog = (): Promise<Map<string, HistoricalTable>> => {
  if (historicalCatalogPromise === null) {
    historicalCatalogPromise = loadHistoricalCatalog().catch((error: unknown) => {
      // A rejected promise would otherwise be cached for the life of the process.
      historicalCatalogPromise = null;
      throw error;
    });
  }

  return historicalCatalogPromise;
};

/** Checks that a name is safe to interpolate as an identifier. */
const requireIdentifier = (value: string): string => {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`resolved identifier is not a plain SQL name: ${JSON.stringify(value)}`);
  }

  return value;
};

/**
 * Picks the column that represents the series.
 *
 * The requested metric wins when it exists. Otherwise the table's shape and the
 * indicator's native aggregation decide.
 */
const resolveMetric = (
  table: HistoricalTable,
  nativeAggregation: string,
  requestedMetric: string | undefined,
): string | null => {
  const requested = requestedMetric?.trim();

  if (requested) {
    return table.numericColumns.has(requested) ? requested : null;
  }

  if (nativeAggregation === "OHLC" && table.columns.has("close")) {
    return "close";
  }

  if (table.columns.has("value")) {
    return "value";
  }

  if (table.columns.has("close")) {
    return "close";
  }

  if (table.table.endsWith("_ig_sentiment") && table.columns.has("net")) {
    return "net";
  }

  if (
    table.table.endsWith("_binance_trader_positioning") &&
    table.columns.has("global_long_short_ratio")
  ) {
    return "global_long_short_ratio";
  }

  if (table.table.startsWith("cftc_") && table.columns.has("open_interest")) {
    return "open_interest";
  }

  if (table.table.endsWith("_spot_etf") && table.columns.has("net_assets")) {
    return "net_assets";
  }

  return DEFAULT_METRICS[table.table] ?? null;
};

// --------------------------------------------------
// Historical reads
// --------------------------------------------------

/**
 * Reads one series' observations for the widest requested window.
 *
 * The upper bound is the series' own latest date, and the lower bound is the
 * deepest requested window before it, so a lagging series still gets charts
 * anchored to its last observation. The metric is cast to `float8` because
 * node-postgres returns NUMERIC as a string.
 */
const fetchHistoricalPoints = async (
  table: HistoricalTable,
  seriesId: string,
  metric: string,
): Promise<IndicatorPoint[]> => {
  if (!table.numericColumns.has(metric)) {
    throw new Error(
      `metric ${JSON.stringify(metric)} is not a numeric column in historical.${table.table}`,
    );
  }

  const tableName = requireIdentifier(table.table);
  const column = requireIdentifier(metric);

  const { rows } = await pool.query<{ date: string; value: number | null }>(
    `
      WITH bounds AS (
        SELECT MAX(date) AS latest
        FROM historical."${tableName}"
        WHERE series_id = $1
      )
      SELECT
        date::text AS date,
        "${column}"::float8 AS value
      FROM historical."${tableName}", bounds
      WHERE series_id = $1
        AND bounds.latest IS NOT NULL
        AND date > bounds.latest - ($2::int * INTERVAL '1 month')
      ORDER BY date ASC;
    `,
    [seriesId, MAX_LOOKBACK_MONTHS],
  );

  const points: IndicatorPoint[] = [];

  for (const row of rows) {
    if (row.value === null) {
      continue;
    }

    const value = Number(row.value);

    if (Number.isFinite(value)) {
      points.push({ date: row.date, value });
    }
  }

  return points;
};

// --------------------------------------------------
// Fetch indicator data
// --------------------------------------------------

/**
 * Finds indicators for a natural-language query and returns their current value
 * and moving-average chart.
 *
 * Invalid input throws. An indicator without a historical table or a usable
 * metric is returned with a `status` and `reason` rather than failing the whole
 * call, because the other matches are still useful.
 *
 * @param query Natural-language description of the series wanted.
 * @param limit How many indicators to return, ranked by similarity.
 * @param metric Optional numeric column to chart instead of the default.
 */
export const fetchIndicatorData = async (
  query: string,
  limit: number = DEFAULT_LIMIT,
  metric?: string,
) => {
  const { embedding, usage } = await createQueryEmbedding(query);

  const { rows } = await pool.query<IndicatorRow>(
    `
      SELECT
        id,
        name,
        domain,
        category,
        description,
        source,
        series_id,
        native_time_unit,
        native_frequency,
        native_aggregation,
        unit,
        significance
      FROM indicator.indicators
      WHERE status = 'active'
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2::int;
    `,
    [JSON.stringify(embedding), limit],
  );

  if (rows.length === 0) {
    return {
      result: {
        found: false,
        query,
        indicators: [],
      } satisfies IndicatorDataResult,
      usage,
    };
  }

  const catalog = await getHistoricalCatalog();

  const indicators: IndicatorIntelligence[] = [];

  for (const row of rows) {
    const metadata = {
      id: row.id,
      name: row.name,
      domain: row.domain,
      category: row.category,
      description: row.description,
      source: row.source,
      seriesId: row.series_id,
      nativeTimeUnit: row.native_time_unit,
      nativeFrequency: row.native_frequency,
      nativeAggregation: row.native_aggregation,
      unit: row.unit,
      significance: row.significance,
    };

    const table = catalog.get(row.series_id);

    if (!table) {
      indicators.push({
        ...metadata,
        status: "no_table",
        reason: "No historical table contains this series_id.",
        historicalTable: null,
        metric: null,
        availableMetrics: [],
        current: null,
        movingAverages: null,
        observations: 0,
        range: null,
      });

      continue;
    }

    const availableMetrics = [...table.numericColumns].sort();
    const resolvedMetric = resolveMetric(table, row.native_aggregation, metric);

    if (resolvedMetric === null) {
      const reason = metric?.trim()
        ? `Requested metric ${JSON.stringify(metric.trim())} is not numeric in historical.${table.table}.`
        : `No primary numeric metric is defined for historical.${table.table}.`;

      indicators.push({
        ...metadata,
        status: "unsupported_metric",
        reason,
        historicalTable: table.table,
        metric: null,
        availableMetrics,
        current: null,
        movingAverages: null,
        observations: 0,
        range: null,
      });

      continue;
    }

    const points = await fetchHistoricalPoints(table, row.series_id, resolvedMetric);
    const averages = computeMovingAverages(points, row.native_time_unit);

    if (averages === null) {
      indicators.push({
        ...metadata,
        status: "no_data",
        reason: `historical.${table.table} has no usable rows for this series_id.`,
        historicalTable: table.table,
        metric: resolvedMetric,
        availableMetrics,
        current: null,
        movingAverages: null,
        observations: 0,
        range: null,
      });

      continue;
    }

    indicators.push({
      ...metadata,
      status: "ok",
      reason: null,
      historicalTable: table.table,
      metric: resolvedMetric,
      availableMetrics,
      ...averages,
    });
  }

  return {
    result: {
      found: true,
      query,
      indicators,
    } satisfies IndicatorDataResult,
    usage,
  };
};

/** The tool the agents name. */
export const fetchIndicatorDataTool = tool({
  description:
    "Finds deterministic indicator series for a natural-language request and returns each series' current value plus its moving-average chart.\n\n" +
    "Returns for every series:\n" +
    "- current value and observation date\n" +
    "- moving averages for 1, 3, 6, 12, 18, 24, 30, 36, 48 and 60 months\n" +
    "- net difference and percentage difference versus each moving average\n" +
    "- whether the current value is above, below or at each average\n" +
    "- native time unit, aggregation, unit and available metrics\n\n" +
    "The chart is anchored to the series' latest observation, not to today, so a lagging series is still readable. Monthly and quarterly series count native observations; daily and weekly series use calendar months.\n\n" +
    "Most indicators have one obvious series. Multi-metric tables (Binance positioning, CFTC, spot ETFs, sentiment surveys, CMC metrics) use a documented primary metric; the result names it and lists every available numeric metric. Pass `metric` only when a previous result showed the column you need.\n\n" +
    "Use for:\n" +
    "- placing a current figure against its recent history\n" +
    "- saying whether something is above or below its long-term level\n" +
    "- comparing the size of a move across indicators\n" +
    "\n" +
    "Limitations:\n" +
    "- read-only; it never changes a row\n" +
    "- historical tables only - no forecasts\n" +
    "- reads only the widest timeframe's window (60 months), not the full history\n" +
    "- a series without a table or usable metric returns a status and reason\n" +
    "- returns found: false only when the catalogue has no match",

  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Describe the quantitative series needed, in natural language. Name the subject and the measure: 'gold price history', 'US 10-year Treasury yield', 'Bitcoin spot ETF assets', 'Binance funding rate'. The closest catalogue indicators are returned, ranked by similarity.",
      ),

    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(DEFAULT_LIMIT)
      .describe(
        "How many matching indicators to return. Use 1-2 for one specific series and a larger number only when the request genuinely spans several measures.",
      ),

    metric: z
      .string()
      .optional()
      .describe(
        "Optional exact numeric column to chart instead of the indicator's primary metric, for example `funding_rate` or `net_flow`. Omit this by default; use only a name listed in `availableMetrics` from a previous result.",
      ),
  }),

  execute: async ({ query, limit, metric }) => {
    const response = await fetchIndicatorData(query, limit, metric);

    return response.result;
  },
});
