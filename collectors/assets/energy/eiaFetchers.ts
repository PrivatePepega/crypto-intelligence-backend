import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import pool from "../../../config/database.js";
import type {
  EiaFrequency,
  EiaObservation,
  EiaSeriesDefinition,
  EiaSeriesResult,
  EnergyAssetInput,
} from "../../../types/EIA/eia.types.js";
import {
  EiaRequestError,
  eiaGet,
  getEiaRequestUsage,
  resetEiaRequestUsage,
  setEiaRequestBudget,
  setEiaRequestsPerMinute,
  type EiaFailureKind,
} from "./eiaClient.js";
import {
  findEiaSeries,
  findEnergyAsset,
  DEFAULT_EIA_SERIES_IDS,
  EIA_SERIES,
} from "./eiaSeriesCatalog.js";
import { isValidPeriod, mergeSeriesResults, normalizeEiaSeries } from "./eiaNormalizer.js";
import {
  createDbClient,
  insertLatestSnapshot,
  readEnergyState,
  upsertCommodityProfile,
  upsertEnergyAsset,
  upsertSeriesObservations,
  type DbClient,
} from "./energyRepository.js";

/**
 * EIA energy collector.
 *
 * Fetches verified EIA API v2 series, normalizes them into scalar observations,
 * and optionally persists them:
 *
 *   assets.assets               canonical benchmark identity (price series only)
 *   assets.commodities          benchmark metadata
 *   assets.series_observations  daily / weekly / monthly history
 *   assets.information          latest observation per series
 *
 * `assets.asset_price_history` is never written: it requires genuine OHLC
 * candles and a scalar EIA value is not a candle.
 *
 * Provider behavior that shaped this collector (verified live on 2026-10-27):
 *
 *   - `frequency` is an aggregation control, not a filter. The daily `RWTC`
 *     series requested at `weekly` returns weekly averages with HTTP 200. Every
 *     series therefore carries a pinned frequency from the catalog.
 *   - `response.total` and `value` are strings.
 *   - Long series are capped at 5,000 rows per request, so collection paginates
 *     with `offset` and reports truncation instead of hiding it.
 *   - An unknown series returns HTTP 200 with `total: "0"`, which is a valid
 *     empty result, not an error.
 *
 * Run with:
 *
 *   npx tsx collectors/assets/energy/eiaFetchers.ts --mode=catalog
 *   npx tsx collectors/assets/energy/eiaFetchers.ts --mode=series --series=RWTC,WCESTUS1
 *   npx tsx collectors/assets/energy/eiaFetchers.ts --mode=all --write
 *   npx tsx collectors/assets/energy/eiaFetchers.ts --mode=readback
 */

const DEFAULT_OUTPUT_DIR = "collectors/assets/energy/data";
const DEFAULT_REQUESTS_PER_MINUTE = 60;
const DEFAULT_MAX_REQUESTS = 120;
const MAX_PAGE_SIZE = 5_000;
const DEFAULT_PAGE_SIZE = 5_000;
const MAX_PAGES_PER_SERIES = 40;
const MAX_SERIES_PER_RUN = 40;

/** Default backfill windows, in calendar days, by native cadence. */
const DEFAULT_LOOKBACK_DAYS: Record<EiaFrequency, number> = {
  daily: 730,
  weekly: 1_825,
  monthly: 7_300,
  quarterly: 7_300,
  annual: 36_500,
};

// --------------------------------------------------
// Arguments
// --------------------------------------------------

const MODES = ["catalog", "series", "all", "availability", "readback"] as const;
type Mode = (typeof MODES)[number];

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).some((argument) => argument === `--${name}`);
}

function parseMode(value: string): Mode {
  if ((MODES as readonly string[]).includes(value)) {
    return value as Mode;
  }
  throw new Error(`Unknown mode "${value}". Allowed: ${MODES.join(", ")}.`);
}

function parsePositiveInteger(value: string | null, fallback: number, label: string): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive integer, got "${value}".`);
  }
  return parsed;
}

/** Parses a comma-separated series list and rejects anything outside the catalog. */
export function parseSeriesList(value: string | null, fallback: readonly string[]): string[] {
  const raw = value === null || value.trim() === "" ? fallback.join(",") : value;
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw.split(",")) {
    const id = entry.trim();
    if (id === "") {
      continue;
    }
    if (findEiaSeries(id) === null) {
      throw new Error(
        `Unknown EIA series "${id}". Verified series: ${DEFAULT_EIA_SERIES_IDS.join(", ")}.`,
      );
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  if (ids.length === 0) {
    throw new Error("No EIA series provided.");
  }
  if (ids.length > MAX_SERIES_PER_RUN) {
    throw new Error(`At most ${MAX_SERIES_PER_RUN} series are accepted per run.`);
  }

  return ids;
}

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Default `start` for a series, expressed in its own period format. */
export function defaultSeriesStart(frequency: EiaFrequency, now = new Date()): string {
  const lookback = DEFAULT_LOOKBACK_DAYS[frequency];
  const start = new Date(now.getTime() - lookback * 86_400_000);

  if (frequency === "annual") {
    return String(start.getUTCFullYear());
  }
  if (frequency === "quarterly") {
    return `${start.getUTCFullYear()}-Q${Math.floor(start.getUTCMonth() / 3) + 1}`;
  }
  if (frequency === "monthly") {
    return start.toISOString().slice(0, 7);
  }
  return utcDateString(start);
}

export interface SeriesWindow {
  /** Provider `start` filter, always in the series' period format. */
  start: string;
  /** Provider `end` filter, or null to let the provider decide. */
  end: string | null;
}

/**
 * Resolves the requested window and validates formats locally.
 *
 * A `from`/`to` in the wrong shape for the cadence is rejected before spending a
 * request, so a daily series can never be asked for `2026-10` and silently
 * aggregated.
 */
export function resolveSeriesWindow(
  definition: EiaSeriesDefinition,
  input: { from: string | null; to: string | null; now?: Date },
): SeriesWindow {
  const start =
    input.from === null ? defaultSeriesStart(definition.frequency, input.now) : input.from.trim();
  const end = input.to === null ? null : input.to.trim();

  if (!isValidPeriod(start, definition.frequency)) {
    throw new Error(
      `--from "${start}" is not a valid ${definition.frequency} period for ${definition.series_id}.`,
    );
  }
  if (end !== null && !isValidPeriod(end, definition.frequency)) {
    throw new Error(
      `--to "${end}" is not a valid ${definition.frequency} period for ${definition.series_id}.`,
    );
  }
  if (end !== null && start > end) {
    throw new Error(`--from (${start}) must not be after --to (${end}).`);
  }

  return { start, end };
}

// --------------------------------------------------
// Provider calls
// --------------------------------------------------

export interface EnergySeriesFetch {
  result: EiaSeriesResult;
  pages: number;
  /** Raw provider rows fetched, before any rejection. */
  rows_fetched: number;
  source_urls: string[];
  provider_raw: unknown[];
}

function countRows(body: unknown): number {
  if (!body || typeof body !== "object") {
    return 0;
  }
  const response = (body as Record<string, unknown>)["response"];
  if (!response || typeof response !== "object") {
    return 0;
  }
  const data = (response as Record<string, unknown>)["data"];
  return Array.isArray(data) ? data.length : 0;
}

/**
 * Fetches one series, paginating with `offset` up to `maxRows`.
 *
 * Every page is normalized independently and merged, so a rejected row in one
 * page cannot corrupt another. Truncation is reported explicitly rather than
 * returning a silently partial series.
 */
export async function fetchEnergySeries(
  definition: EiaSeriesDefinition,
  window: SeriesWindow,
  options: {
    pageSize?: number;
    maxRows?: number;
    maxPages?: number;
    /** `asc` for backfills, `desc` when only the newest row matters. */
    direction?: "asc" | "desc";
  } = {},
): Promise<EnergySeriesFetch> {
  const pageSize = Math.min(Math.max(options.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const maxRows = Math.max(options.maxRows ?? MAX_PAGE_SIZE * MAX_PAGES_PER_SERIES, 1);
  const maxPages = Math.min(Math.max(options.maxPages ?? MAX_PAGES_PER_SERIES, 1), 200);

  const fetchedAt = new Date().toISOString();
  const requested = {
    start: window.start,
    end: window.end,
    limit: maxRows,
  };

  const results: EiaSeriesResult[] = [];
  const sourceUrls: string[] = [];
  const providerRaw: unknown[] = [];

  let offset = 0;
  let rowsFetched = 0;
  let pages = 0;
  let stoppedByLimit = false;

  while (true) {
    const remaining = maxRows - rowsFetched;
    const length = Math.min(pageSize, remaining);

    const params: Record<string, string> = {
      frequency: definition.frequency,
      "data[0]": "value",
      "facets[series][]": definition.series_id,
      "sort[0][column]": "period",
      "sort[0][direction]": options.direction ?? "asc",
      offset: String(offset),
      length: String(length),
      start: window.start,
    };
    if (window.end !== null) {
      params["end"] = window.end;
    }

    const response = await eiaGet(
      definition.route,
      params,
      `${definition.series_id} ${definition.frequency} offset=${offset}`,
    );

    pages += 1;
    const pageRows = countRows(response.data);

    results.push(
      normalizeEiaSeries(response.data, {
        definition,
        fetchedAt,
        requested,
        truncated: false,
      }),
    );
    sourceUrls.push(response.url);
    providerRaw.push(response.data);

    rowsFetched += pageRows;

    if (pageRows < length) {
      break;
    }
    if (rowsFetched >= maxRows) {
      stoppedByLimit = true;
      break;
    }
    if (pages >= maxPages) {
      stoppedByLimit = true;
      break;
    }

    offset += pageRows;
  }

  const merged = mergeSeriesResults(results, { definition, fetchedAt, requested });

  // `total` counts matching provider rows, not accepted observations, so it is
  // compared against fetched rows. Rejected rows are reported separately.
  const providerTotal = merged.provider_total;
  merged.truncated = stoppedByLimit || (providerTotal !== null && rowsFetched < providerTotal);

  return {
    result: merged,
    pages,
    rows_fetched: rowsFetched,
    source_urls: sourceUrls,
    provider_raw: providerRaw,
  };
}

// --------------------------------------------------
// Persistence
// --------------------------------------------------

export interface EnergyPersistenceResult {
  asset_id: string | null;
  asset_created: boolean;
  observations_inserted: number;
  observations_updated: number;
  observations_skipped: number;
  snapshot_inserted: boolean;
  snapshot_key: string | null;
}

function buildAssetInput(definition: EiaSeriesDefinition): EnergyAssetInput {
  const assetSymbol = definition.asset_symbol;
  if (assetSymbol === null) {
    throw new Error(`${definition.series_id} is not a price series and has no asset.`);
  }

  const asset = findEnergyAsset(assetSymbol);
  if (asset === null) {
    throw new Error(`No curated asset definition for symbol ${assetSymbol}.`);
  }

  return {
    symbol: asset.symbol,
    name: asset.name,
    commodity_type: asset.commodity_type,
    benchmark: asset.benchmark,
    currency: asset.currency,
    unit_of_measure: asset.unit_of_measure,
    value_drivers: asset.value_drivers,
    provider_series: definition.series_id,
    provider_route: definition.route,
    provider_frequency: definition.frequency,
    provider_unit: definition.unit,
    provider_title: definition.title,
  };
}

/**
 * Persists one series inside the caller's transaction.
 *
 * Prices create/reuse a benchmark asset and are stored as `market_snapshot`.
 * Supply/demand statistics are market-wide and stored as `macro_context` with a
 * NULL `asset_id`.
 */
export async function persistEnergySeries(
  client: DbClient,
  input: {
    definition: EiaSeriesDefinition;
    observations: EiaObservation[];
    sourceUrl: string | null;
  },
): Promise<EnergyPersistenceResult> {
  const { definition } = input;

  let assetId: string | null = null;
  let assetCreated = false;

  if (definition.kind === "price") {
    const assetInput = buildAssetInput(definition);
    const asset = await upsertEnergyAsset(client, assetInput);
    await upsertCommodityProfile(client, asset.asset_id, assetInput);
    assetId = asset.asset_id;
    assetCreated = asset.created;
  }

  const observations = await upsertSeriesObservations(client, input.observations, {
    definition,
    source: "eia",
    sourceUrl: input.sourceUrl,
  });

  let snapshotInserted = false;
  let snapshotKey: string | null = null;

  const latest = input.observations[input.observations.length - 1];
  if (latest !== undefined) {
    const snapshot = await insertLatestSnapshot(client, {
      asset_id: assetId,
      information_type: definition.kind === "price" ? "market_snapshot" : "macro_context",
      definition,
      observation: latest,
      source_url: input.sourceUrl ?? "",
    });
    snapshotInserted = snapshot.inserted;
    snapshotKey = snapshot.snapshot_key;
  }

  return {
    asset_id: assetId,
    asset_created: assetCreated,
    observations_inserted: observations.inserted,
    observations_updated: observations.updated,
    observations_skipped: observations.skipped,
    snapshot_inserted: snapshotInserted,
    snapshot_key: snapshotKey,
  };
}

async function withTransaction<T>(work: (client: DbClient) => Promise<T>): Promise<T> {
  const connection = await pool.connect();
  const client = createDbClient(connection);

  try {
    await connection.query("BEGIN");
    const result = await work(client);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

// --------------------------------------------------
// Output
// --------------------------------------------------

async function saveJson(outputDir: string, filename: string, data: unknown): Promise<string> {
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  return filePath;
}

function describeFailure(error: unknown): { kind: EiaFailureKind | "unexpected"; message: string } {
  if (error instanceof EiaRequestError) {
    return { kind: error.kind, message: error.message };
  }
  return {
    kind: "unexpected",
    message: error instanceof Error ? error.message : String(error),
  };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

// --------------------------------------------------
// Modes
// --------------------------------------------------

interface SeriesRunReport {
  series_id: string;
  frequency: EiaFrequency;
  unit: string;
  kind: "price" | "fundamental";
  mode: "fetched" | "skipped";
  rows_fetched: number;
  observations: number;
  rejected: number;
  duplicates_removed: number;
  truncated: boolean;
  provider_total: number | null;
  pages: number;
  persisted: EnergyPersistenceResult | null;
  errors: string[];
  notes: string[];
}

function emptyReport(definition: EiaSeriesDefinition): SeriesRunReport {
  return {
    series_id: definition.series_id,
    frequency: definition.frequency,
    unit: definition.unit,
    kind: definition.kind,
    mode: "skipped",
    rows_fetched: 0,
    observations: 0,
    rejected: 0,
    duplicates_removed: 0,
    truncated: false,
    provider_total: null,
    pages: 0,
    persisted: null,
    errors: [],
    notes: [],
  };
}

function printReport(reports: SeriesRunReport[], usage: { used: number; budget: number }): void {
  console.log("\nSeries summary:");
  for (const report of reports) {
    const status =
      report.errors.length > 0
        ? `ERROR: ${report.errors.join("; ")}`
        : report.observations === 0
          ? "ok (no observations)"
          : "ok";

    console.log(
      `  ${report.series_id.padEnd(24)} ${report.frequency.padEnd(8)} ${report.unit.padEnd(8)} ` +
        `rows=${String(report.rows_fetched).padStart(4)} kept=${String(report.observations).padStart(4)} ` +
        `rejected=${report.rejected} pages=${report.pages} ` +
        `${report.truncated ? "TRUNCATED " : ""}${status}`,
    );

    if (report.persisted) {
      console.log(
        `          db: asset=${report.persisted.asset_id?.slice(0, 8) ?? "none"}` +
          `${report.persisted.asset_created ? " (created)" : ""} ` +
          `observations inserted=${report.persisted.observations_inserted} ` +
          `updated=${report.persisted.observations_updated} ` +
          `snapshot=${report.persisted.snapshot_inserted ? "inserted" : "unchanged"}`,
      );
    }

    for (const note of report.notes) {
      console.log(`          note: ${truncate(note, 160)}`);
    }
  }

  console.log(`\nEIA requests this run: ${usage.used}/${usage.budget}`);
}

async function runCatalog(outputDir: string): Promise<void> {
  const filePath = await saveJson(outputDir, "eia series_catalog.json", {
    provider: "eia",
    checked_at: new Date().toISOString(),
    note: "Verified against api.eia.gov/v2 on 2026-10-27. Frequency and unit are pinned per series.",
    series: EIA_SERIES,
  });

  console.log(`  ✓ catalog: ${EIA_SERIES.length} verified series`);
  for (const definition of EIA_SERIES) {
    console.log(
      `    ${definition.series_id.padEnd(24)} ${definition.frequency.padEnd(8)} ` +
        `${definition.unit.padEnd(8)} ${definition.kind.padEnd(11)} ${definition.category}`,
    );
  }
  console.log(`  ✓ Wrote ${filePath}`);
}

async function runSeries(
  outputDir: string,
  seriesIds: string[],
  options: {
    from: string | null;
    to: string | null;
    maxRows: number;
    pageSize: number;
    write: boolean;
    saveRaw: boolean;
  },
): Promise<SeriesRunReport[]> {
  const reports: SeriesRunReport[] = [];

  for (const seriesId of seriesIds) {
    const definition = findEiaSeries(seriesId);
    if (definition === null) {
      throw new Error(`Series ${seriesId} disappeared from the catalog.`);
    }

    const report = emptyReport(definition);

    let window: SeriesWindow;
    try {
      window = resolveSeriesWindow(definition, { from: options.from, to: options.to });
    } catch (error) {
      report.errors.push(error instanceof Error ? error.message : String(error));
      reports.push(report);
      continue;
    }

    const windowLabel = `${window.start}_${window.end ?? "latest"}`;

    try {
      const fetched = await fetchEnergySeries(definition, window, {
        pageSize: options.pageSize,
        maxRows: options.maxRows,
      });

      report.mode = "fetched";
      report.rows_fetched = fetched.rows_fetched;
      report.observations = fetched.result.observations.length;
      report.rejected = fetched.result.rejected.length;
      report.duplicates_removed = fetched.result.duplicates_removed;
      report.truncated = fetched.result.truncated;
      report.provider_total = fetched.result.provider_total;
      report.pages = fetched.pages;

      await saveJson(outputDir, `eia observations_${seriesId}_${windowLabel}.json`, {
        ...fetched.result,
        pages: fetched.pages,
        rows_fetched: fetched.rows_fetched,
        window,
      });

      if (options.saveRaw) {
        await saveJson(outputDir, `eia observations_raw_${seriesId}_${windowLabel}.json`, {
          provider: "eia",
          series_id: seriesId,
          route: definition.route,
          frequency: definition.frequency,
          fetched_at: fetched.result.fetched_at,
          source_urls: fetched.source_urls,
          pages: fetched.provider_raw,
        });
      }

      for (const warning of fetched.result.warnings) {
        report.notes.push(`provider warning: ${warning}`);
      }
      if (fetched.result.truncated) {
        report.notes.push(
          `provider returned ${fetched.rows_fetched} of ${report.provider_total ?? "an unknown number of"} row(s); re-run with a narrower --from/--to or a higher --max-rows`,
        );
      }
      if (report.observations === 0) {
        report.notes.push("provider returned no observations for this window (valid empty result)");
      }
      if (report.rejected > 0) {
        const first = fetched.result.rejected[0];
        report.notes.push(
          `dropped ${report.rejected} unusable row(s); first: ${first?.period ?? "?"} ${first?.reason ?? ""}`,
        );
      }

      if (options.write && report.observations > 0) {
        report.persisted = await withTransaction((client) =>
          persistEnergySeries(client, {
            definition,
            observations: fetched.result.observations,
            sourceUrl: fetched.source_urls[0] ?? null,
          }),
        );
      } else if (options.write) {
        report.notes.push("nothing to persist for this window");
      }
    } catch (error) {
      const failure = describeFailure(error);
      report.errors.push(`${failure.kind}: ${failure.message}`);
    }

    reports.push(report);
  }

  return reports;
}

async function runAvailability(outputDir: string, seriesIds: string[]): Promise<boolean> {
  const results: Array<Record<string, unknown>> = [];

  for (const seriesId of seriesIds) {
    const definition = findEiaSeries(seriesId);
    if (definition === null) {
      throw new Error(`Series ${seriesId} disappeared from the catalog.`);
    }

    try {
      const fetched = await fetchEnergySeries(
        definition,
        resolveSeriesWindow(definition, { from: null, to: null }),
        { pageSize: 1, maxRows: 1, direction: "desc" },
      );

      const latest = fetched.result.observations[fetched.result.observations.length - 1] ?? null;
      const rejected = fetched.result.rejected[0] ?? null;

      results.push({
        series_id: seriesId,
        route: definition.route,
        frequency: definition.frequency,
        expected_unit: definition.unit,
        accessible: latest !== null,
        latest_period: latest?.period ?? null,
        latest_value: latest?.value ?? null,
        rejection: rejected?.reason ?? null,
      });

      console.log(
        `  ${seriesId.padEnd(24)} ${latest ? `ok ${latest.period}=${latest.value} ${definition.unit}` : `unusable: ${rejected?.reason ?? "no rows"}`}`,
      );
    } catch (error) {
      const failure = describeFailure(error);
      results.push({
        series_id: seriesId,
        route: definition.route,
        frequency: definition.frequency,
        expected_unit: definition.unit,
        accessible: false,
        kind: failure.kind,
        message: failure.message,
      });
      console.log(`  ${seriesId.padEnd(24)} ${failure.kind}: ${truncate(failure.message, 120)}`);
    }
  }

  const filePath = await saveJson(outputDir, "eia series_availability.json", {
    provider: "eia",
    checked_at: new Date().toISOString(),
    note: "A series that returns rows with a changed unit is reported as unusable rather than converted.",
    results,
  });

  console.log(`  ✓ Wrote ${filePath}`);
  return results.every((entry) => entry["accessible"] === true);
}

async function runReadback(seriesIds: string[]): Promise<boolean> {
  const client = await pool.connect();

  try {
    const db = createDbClient(client);
    const states = await readEnergyState(db, seriesIds, {
      recentObservations: 5,
      recentSnapshots: 2,
    });

    let missing = 0;

    for (const state of states) {
      const definition = findEiaSeries(state.series_id);

      if (state.observation_count === 0) {
        missing += 1;
        console.log(`\n${state.series_id}: no observations stored`);
        continue;
      }

      console.log(
        `\n${state.series_id}  ${definition?.frequency ?? "?"}  ${definition?.unit ?? "?"}`,
      );
      console.log(
        `  asset:      ${state.asset ? `${state.asset.id} ${state.asset.symbol} "${state.asset.name}"` : "none (market-wide)"}`,
      );
      console.log(
        `  history:    ${state.observation_count} observation(s) ` +
          `${state.earliest_period ?? "-"} .. ${state.latest_period ?? "-"}`,
      );

      for (const row of state.recent) {
        console.log(
          `    ${String(row["period"])} = ${String(row["value"])} ${String(row["unit"])} ` +
            `(${String(row["frequency"])}, collected ${String(row["collected_at"])})`,
        );
      }

      console.log(`  snapshots:  ${state.snapshots.length}`);
      for (const snapshot of state.snapshots) {
        const data = snapshot["data"] as Record<string, unknown> | undefined;
        console.log(
          `    ${String(snapshot["information_type"])} ${String(data?.["period"])}=` +
            `${String(data?.["value"])} ${String(data?.["unit"])} ` +
            `asset=${snapshot["asset_id"] === null ? "null" : "linked"}`,
        );
      }
    }

    return missing === 0;
  } finally {
    client.release();
  }
}

// --------------------------------------------------
// Help
// --------------------------------------------------

function printHelp(): void {
  console.log(`EIA energy collector

Usage:
  npx tsx collectors/assets/energy/eiaFetchers.ts --mode=series --series=RWTC,WCESTUS1 --write

Modes:
  catalog       Write the verified series catalog (no API request).
  series        Fetch the requested series only.
  all           Fetch every verified series.
  availability  Probe each series for one live row and report unit drift.
  readback      Read stored observations back (read-only).

Options:
  --series=RWTC,WCESTUS1  Verified series ids (default: all).
  --from=...              Period start in the series' own format
                          (YYYY-MM-DD daily/weekly, YYYY-MM monthly).
  --to=...                Period end, same format.
  --max-rows=5000         Rows per series across pages.
  --page-size=5000        Rows per request (provider caps at 5000).
  --write                 Persist to assets.assets / commodities /
                          series_observations / information. Off by default.
  --save-raw=false        Skip the raw provider page artifacts.
  --rpm=60                Requests per minute.
  --max-requests=120      Hard request budget for this run.
  --output-dir=...        Default collectors/assets/energy/data.
  --help                  Show this message.

Frequency and unit are pinned per series in eiaSeriesCatalog.ts and are never
taken from flags. assets.asset_price_history is never written: EIA values are
scalar observations, not OHLC candles.
No credentials are stored or printed; EIA_API_KEY comes from the environment.
`);
}

// --------------------------------------------------
// Entry point
// --------------------------------------------------

async function main(): Promise<void> {
  if (hasFlag("help") || hasFlag("h")) {
    printHelp();
    return;
  }

  const mode = parseMode(getArg("mode") ?? "all");
  const outputDir = path.resolve(process.cwd(), getArg("output-dir") ?? DEFAULT_OUTPUT_DIR);
  const requestsPerMinute = parsePositiveInteger(getArg("rpm"), DEFAULT_REQUESTS_PER_MINUTE, "rpm");
  const maxRequests = parsePositiveInteger(
    getArg("max-requests"),
    DEFAULT_MAX_REQUESTS,
    "max-requests",
  );
  const maxRows = parsePositiveInteger(getArg("max-rows"), DEFAULT_PAGE_SIZE, "max-rows");
  const pageSize = parsePositiveInteger(getArg("page-size"), DEFAULT_PAGE_SIZE, "page-size");
  const write = hasFlag("write");
  const saveRaw = getArg("save-raw") !== "false";

  setEiaRequestsPerMinute(requestsPerMinute);
  setEiaRequestBudget(maxRequests);
  resetEiaRequestUsage(maxRequests);

  await fs.mkdir(outputDir, { recursive: true });

  if (mode === "readback") {
    const seriesIds = parseSeriesList(getArg("series"), DEFAULT_EIA_SERIES_IDS);
    const ok = await runReadback(seriesIds);
    if (!ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (mode === "catalog") {
    await runCatalog(outputDir);
    console.log(`\nEIA requests this run: ${getEiaRequestUsage().used}/${maxRequests}`);
    return;
  }

  const seriesIds = parseSeriesList(getArg("series"), DEFAULT_EIA_SERIES_IDS);

  if (mode === "availability") {
    const ok = await runAvailability(outputDir, seriesIds);
    if (!ok) {
      process.exitCode = 1;
    }
    console.log(`\nEIA requests this run: ${getEiaRequestUsage().used}/${maxRequests}`);
    return;
  }

  console.log(
    `EIA energy: mode=${mode} series=${seriesIds.length} write=${write ? "yes" : "no"} ` +
      `max-rows=${maxRows} from=${getArg("from") ?? "(default)"} to=${getArg("to") ?? "latest"}`,
  );

  const reports = await runSeries(outputDir, seriesIds, {
    from: getArg("from"),
    to: getArg("to"),
    maxRows,
    pageSize,
    write,
    saveRaw,
  });

  printReport(reports, getEiaRequestUsage());

  const failed = reports.filter((report) => report.errors.length > 0);
  const stored = reports.filter((report) => report.persisted !== null);

  console.log(
    `\n${reports.length - failed.length}/${reports.length} series collected` +
      (stored.length > 0 ? `, ${stored.length} persisted` : ""),
  );

  if (failed.length > 0) {
    console.error(`${failed.length} series failed.`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("EIA energy collection failed:", message);
    process.exitCode = 1;
  });
}
