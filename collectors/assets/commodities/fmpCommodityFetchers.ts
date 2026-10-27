import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import pool from "../../../config/database.js";
import type {
  CommodityCandle,
  CommodityHistory,
  CommodityIdentity,
  CommodityListSnapshot,
  CommodityQuote,
} from "../../../types/FMP/fmpCommodity.types.js";
import { findCommodityReference, DEFAULT_COMMODITY_SYMBOLS } from "./commodityReference.js";
import {
  createDbClient,
  insertMarketSnapshot,
  readCommodityState,
  upsertCommodityAsset,
  upsertCommodityProfile,
  upsertDailyCandles,
  type DbClient,
} from "./commodityRepository.js";
import {
  FmpRequestError,
  getFmpRequestUsage,
  resetFmpRequestUsage,
  setFmpRequestBudget,
  setFmpRequestsPerMinute,
  type FmpFailureKind,
} from "./fmpClient.js";
import { fmpGet } from "./fmpClient.js";
import {
  buildCommodityAssetInput,
  findListedCommodity,
  mergeCommodityHistories,
  normalizeCommodityHistory,
  normalizeCommodityList,
  normalizeCommodityQuote,
  parseProviderDate,
} from "./fmpCommodityNormalizer.js";

/**
 * FMP commodity collector.
 *
 * Discovers provider-listed commodity contracts, fetches current quotes and
 * genuine daily OHLC history, normalizes them, and optionally persists them to
 * `assets.*`.
 *
 * Endpoints:
 *
 *   GET /commodities-list
 *   GET /quote?symbol=...
 *   GET /historical-price-eod/full?symbol=...&from=...&to=...
 *
 * `/batch-commodity-quotes` is implemented by the provider but is **not**
 * available on the account used here (HTTP 402), so this collector does not
 * depend on it.
 *
 * Observed provider behavior (2026-10-27):
 *
 *   - `/quote` returns a single-element array.
 *   - History returns newest-first rows with `volume`, `change`,
 *     `changePercent`, `vwap`.
 *   - History is capped at 5,000 rows per request, so long backfills are chunked.
 *     A request without `from`/`to` returned ~5 years.
 *   - Weekends and holidays return `200 []`, which is a valid empty result.
 *   - A restricted plan or unknown symbol returns `402` with a text body. That is
 *     never treated as "no data".
 *
 * Run with:
 *
 *   npx tsx collectors/assets/commodities/fmpCommodityFetchers.ts --mode=catalog
 *   npx tsx collectors/assets/commodities/fmpCommodityFetchers.ts --mode=all --symbols=GCUSD --write
 *   npx tsx collectors/assets/commodities/fmpCommodityFetchers.ts --mode=readback --symbols=GCUSD
 */

const DEFAULT_OUTPUT_DIR = "collectors/assets/commodities/data";
const DEFAULT_DAYS = 365;
const DEFAULT_CHUNK_DAYS = 365;
const MAX_CHUNK_DAYS = 3_650;
const MAX_WINDOWS = 400;
const MAX_SYMBOLS = 40;
const DEFAULT_SNAPSHOT_RPM = 120;

const HISTORY_ENDPOINT = "/historical-price-eod/full";
const QUOTE_ENDPOINT = "/quote";
const LIST_ENDPOINT = "/commodities-list";

// --------------------------------------------------
// Arguments
// --------------------------------------------------

const MODES = ["catalog", "quote", "history", "all", "availability", "readback"] as const;
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

/** Parses a comma-separated symbol list into unique uppercase symbols. */
export function parseSymbolList(value: string | null, fallback: readonly string[]): string[] {
  const raw = value === null || value.trim() === "" ? fallback.join(",") : value;
  const symbols: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw.split(",")) {
    const symbol = entry.trim().toUpperCase();
    if (symbol === "") {
      continue;
    }
    if (!/^[A-Z0-9^._-]{1,40}$/.test(symbol)) {
      throw new Error(`Invalid commodity symbol "${entry.trim()}".`);
    }
    if (!seen.has(symbol)) {
      seen.add(symbol);
      symbols.push(symbol);
    }
  }

  if (symbols.length === 0) {
    throw new Error("No commodity symbols provided.");
  }
  if (symbols.length > MAX_SYMBOLS) {
    throw new Error(`At most ${MAX_SYMBOLS} symbols are accepted per run.`);
  }

  return symbols;
}

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves the requested history range.
 *
 * Defaults to the last `days` calendar days including today. Validation is local
 * so an inverted range never costs a provider request.
 */
export function resolveDateRange(input: {
  from: string | null;
  to: string | null;
  days: number;
  now?: Date;
}): { from: string; to: string } {
  const today = utcDateString(input.now ?? new Date());
  const to = input.to === null ? today : input.to.trim();

  if (parseProviderDate(to) === null) {
    throw new Error(`--to must be a valid YYYY-MM-DD date, got "${input.to}".`);
  }

  let from: string;
  if (input.from === null) {
    const toDate = new Date(`${to}T00:00:00.000Z`);
    const fromDate = new Date(toDate.getTime() - (input.days - 1) * 86_400_000);
    from = utcDateString(fromDate);
  } else {
    from = input.from.trim();
    if (parseProviderDate(from) === null) {
      throw new Error(`--from must be a valid YYYY-MM-DD date, got "${input.from}".`);
    }
  }

  if (from > to) {
    throw new Error(`--from (${from}) must not be after --to (${to}).`);
  }

  return { from, to };
}

export interface DateWindow {
  from: string;
  to: string;
}

/**
 * Splits a date range into inclusive windows.
 *
 * FMP caps history responses at 5,000 rows, which is roughly 19 years of trading
 * days. Chunking keeps every request well under that ceiling and makes a
 * truncated response detectable instead of silent.
 */
export function buildDateWindows(from: string, to: string, chunkDays: number): DateWindow[] {
  if (parseProviderDate(from) === null || parseProviderDate(to) === null) {
    throw new Error(`Invalid date range: ${from} .. ${to}.`);
  }
  if (from > to) {
    throw new Error(`Cannot build windows for an inverted range: ${from} .. ${to}.`);
  }
  if (!Number.isInteger(chunkDays) || chunkDays < 1 || chunkDays > MAX_CHUNK_DAYS) {
    throw new Error(`Chunk size must be between 1 and ${MAX_CHUNK_DAYS} days.`);
  }

  const windows: DateWindow[] = [];
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  let cursor = new Date(`${from}T00:00:00.000Z`).getTime();

  while (cursor <= end) {
    const windowEnd = Math.min(cursor + (chunkDays - 1) * 86_400_000, end);
    windows.push({
      from: utcDateString(new Date(cursor)),
      to: utcDateString(new Date(windowEnd)),
    });

    if (windows.length > MAX_WINDOWS) {
      throw new Error(
        `Date range needs more than ${MAX_WINDOWS} windows; narrow the range or increase --chunk-days.`,
      );
    }

    cursor = windowEnd + 86_400_000;
  }

  return windows;
}

// --------------------------------------------------
// Provider calls
// --------------------------------------------------

export interface CommodityCatalogResult {
  snapshot: CommodityListSnapshot;
  source_url: string;
}

/** Fetches and normalizes `/commodities-list`. */
export async function fetchCommodityCatalog(): Promise<CommodityCatalogResult> {
  const fetchedAt = new Date().toISOString();
  const result = await fmpGet(LIST_ENDPOINT, {}, "commodity list");
  const snapshot = normalizeCommodityList(result.data, {
    endpoint: LIST_ENDPOINT,
    fetchedAt,
  });

  if (Array.isArray(result.data) && result.data.length > 0 && snapshot.commodities.length === 0) {
    throw new Error(
      "FMP /commodities-list returned rows but none passed validation; the payload shape changed.",
    );
  }

  return { snapshot, source_url: result.url };
}

export interface CommodityQuoteFetch {
  quote: CommodityQuote | null;
  rejection: string | null;
  source_url: string;
  provider_raw: unknown;
}

/**
 * Fetches and normalizes a single `/quote`.
 *
 * A 402 from the provider propagates as {@link FmpRequestError} with kind
 * `restricted`; a valid but unusable row returns `quote: null` with a reason.
 */
export async function fetchCommodityQuote(
  symbol: string,
  options: { currency?: string | null; collectedAt?: string } = {},
): Promise<CommodityQuoteFetch> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const result = await fmpGet(
    QUOTE_ENDPOINT,
    { symbol: normalizedSymbol },
    `quote ${normalizedSymbol}`,
  );

  const rows = Array.isArray(result.data) ? result.data : [];
  const rawRow = rows[0];

  if (rawRow === undefined) {
    return {
      quote: null,
      rejection: "provider returned an empty quote array",
      source_url: result.url,
      provider_raw: result.data,
    };
  }

  const normalized = normalizeCommodityQuote(rawRow, {
    symbol: normalizedSymbol,
    currency: options.currency ?? null,
    collectedAt: options.collectedAt ?? new Date().toISOString(),
  });

  if (!normalized.ok) {
    return {
      quote: null,
      rejection: normalized.reason,
      source_url: result.url,
      provider_raw: rawRow,
    };
  }

  return {
    quote: normalized.quote,
    rejection: null,
    source_url: result.url,
    provider_raw: rawRow,
  };
}

export interface CommodityHistoryFetch {
  history: CommodityHistory;
  windows: Array<{ from: string; to: string; rows: number; empty: boolean }>;
  provider_raw: Array<{ from: string; to: string; rows: unknown[] }>;
  source_urls: string[];
}

/**
 * Fetches daily OHLC history over a chunked range.
 *
 * An empty array for a window is a legitimate result (weekend or holiday) and is
 * reported as `empty` rather than treated as an error.
 */
export async function fetchCommodityHistory(
  symbol: string,
  range: DateWindow,
  options: { chunkDays?: number; saveRaw?: boolean } = {},
): Promise<CommodityHistoryFetch> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const windows = buildDateWindows(range.from, range.to, options.chunkDays ?? DEFAULT_CHUNK_DAYS);
  const fetchedAt = new Date().toISOString();

  const histories: CommodityHistory[] = [];
  const windowReports: CommodityHistoryFetch["windows"] = [];
  const providerRaw: CommodityHistoryFetch["provider_raw"] = [];
  const sourceUrls: string[] = [];

  for (const window of windows) {
    const result = await fmpGet(
      HISTORY_ENDPOINT,
      { symbol: normalizedSymbol, from: window.from, to: window.to },
      `history ${normalizedSymbol} ${window.from}..${window.to}`,
    );

    const rows = Array.isArray(result.data) ? result.data : [];
    sourceUrls.push(result.url);

    const history = normalizeCommodityHistory(result.data, {
      symbol: normalizedSymbol,
      fetchedAt,
      requested: { from: window.from, to: window.to },
    });

    histories.push(history);
    windowReports.push({
      from: window.from,
      to: window.to,
      rows: history.candles.length,
      empty: rows.length === 0,
    });

    if (options.saveRaw !== false) {
      providerRaw.push({ from: window.from, to: window.to, rows });
    }
  }

  return {
    history: mergeCommodityHistories(normalizedSymbol, fetchedAt, range, histories),
    windows: windowReports,
    provider_raw: providerRaw,
    source_urls: sourceUrls,
  };
}

// --------------------------------------------------
// Persistence
// --------------------------------------------------

export interface CommodityPersistenceResult {
  asset_id: string;
  asset_created: boolean;
  candles_inserted: number;
  candles_updated: number;
  snapshot_inserted: boolean;
  snapshot_key: string | null;
}

/**
 * Persists one commodity observation inside a transaction.
 *
 * The transaction guarantees that an asset is never created without its
 * metadata row, and that candles and the quote snapshot commit together.
 */
export async function persistCommodity(
  client: DbClient,
  input: {
    identity: CommodityIdentity;
    quote: CommodityQuote | null;
    candles: CommodityCandle[];
    quoteSourceUrl: string | null;
  },
): Promise<CommodityPersistenceResult> {
  const assetInput = buildCommodityAssetInput(input.identity);
  const asset = await upsertCommodityAsset(client, assetInput);
  await upsertCommodityProfile(client, asset.asset_id, assetInput);

  let candlesInserted = 0;
  let candlesUpdated = 0;

  if (input.candles.length > 0) {
    const candleResult = await upsertDailyCandles(client, asset.asset_id, input.candles, {
      quoteCurrency: assetInput.currency,
    });
    candlesInserted = candleResult.inserted;
    candlesUpdated = candleResult.updated;
  }

  let snapshotInserted = false;
  let snapshotKey: string | null = null;

  if (input.quote !== null) {
    const snapshot = await insertMarketSnapshot(
      client,
      asset.asset_id,
      input.quote,
      input.quoteSourceUrl ?? "",
    );
    snapshotInserted = snapshot.inserted;
    snapshotKey = snapshot.snapshot_key;
  }

  return {
    asset_id: asset.asset_id,
    asset_created: asset.created,
    candles_inserted: candlesInserted,
    candles_updated: candlesUpdated,
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

function describeFailure(error: unknown): { kind: FmpFailureKind | "unexpected"; message: string } {
  if (error instanceof FmpRequestError) {
    return { kind: error.kind, message: error.message };
  }
  return {
    kind: "unexpected",
    message: error instanceof Error ? error.message : String(error),
  };
}

function isPlanRestriction(kind: FmpFailureKind | "unexpected"): boolean {
  return kind === "restricted" || kind === "unauthorized";
}

// --------------------------------------------------
// Modes
// --------------------------------------------------

interface SymbolRunReport {
  symbol: string;
  listed: boolean;
  quote: "ok" | "empty" | "skipped";
  history_candles: number;
  history_windows: number;
  history_rejected: number;
  persisted: CommodityPersistenceResult | null;
  restriction: string | null;
  errors: string[];
  notes: string[];
}

function emptyReport(symbol: string): SymbolRunReport {
  return {
    symbol,
    listed: false,
    quote: "skipped",
    history_candles: 0,
    history_windows: 0,
    history_rejected: 0,
    persisted: null,
    restriction: null,
    errors: [],
    notes: [],
  };
}

/** Keeps console output readable without hiding which failure occurred. */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function printReport(reports: SymbolRunReport[], usage: { used: number; budget: number }): void {
  console.log("\nSymbol summary:");
  for (const report of reports) {
    const restriction = report.restriction === null ? null : truncate(report.restriction, 110);
    const status = restriction
      ? `RESTRICTED: ${restriction}`
      : report.errors.length > 0
        ? `ERROR: ${report.errors.join("; ")}`
        : "ok";

    console.log(
      `  ${report.symbol.padEnd(7)} listed=${report.listed ? "yes" : "no "} ` +
        `quote=${report.quote.padEnd(7)} candles=${String(report.history_candles).padStart(4)} ` +
        `windows=${report.history_windows} rejected=${report.history_rejected} ${status}`,
    );

    if (report.persisted) {
      console.log(
        `          db: asset=${report.persisted.asset_id.slice(0, 8)}` +
          `${report.persisted.asset_created ? " (created)" : ""} ` +
          `candles inserted=${report.persisted.candles_inserted} updated=${report.persisted.candles_updated} ` +
          `snapshot=${report.persisted.snapshot_inserted ? "inserted" : "unchanged"}`,
      );
    }

    for (const note of report.notes) {
      console.log(`          note: ${note}`);
    }
  }

  console.log(`\nFMP requests this run: ${usage.used}/${usage.budget}`);
}

async function runCatalog(outputDir: string, probe: boolean): Promise<boolean> {
  const catalog = await fetchCommodityCatalog();
  const filePath = await saveJson(outputDir, "fmp commodities_list.json", catalog.snapshot);

  console.log(
    `  ✓ catalog: ${catalog.snapshot.commodities.length} contracts, ` +
      `${catalog.snapshot.rejected_rows} rejected row(s)`,
  );
  console.log(`  ✓ Wrote ${filePath}`);

  const targets = DEFAULT_COMMODITY_SYMBOLS;
  console.log("\nDefault targets:");
  for (const symbol of targets) {
    const listed = findListedCommodity(catalog.snapshot, symbol);
    const reference = findCommodityReference(symbol);
    console.log(
      `  ${symbol.padEnd(7)} ${listed ? `listed as "${listed.provider_name ?? "?"}"` : "NOT LISTED"}` +
        `  type=${reference?.commodity_type ?? "unknown"}`,
    );
  }

  if (!probe) {
    return true;
  }

  console.log("\nQuote access probe (uses one request per symbol):");
  const availability: Array<Record<string, unknown>> = [];

  for (const symbol of targets) {
    try {
      const result = await fetchCommodityQuote(symbol);
      availability.push({
        symbol,
        accessible: result.quote !== null,
        price: result.quote?.price ?? null,
        rejection: result.rejection,
      });
      console.log(
        `  ${symbol.padEnd(7)} ${result.quote ? `price=${result.quote.price}` : `unusable: ${result.rejection}`}`,
      );
    } catch (error) {
      const failure = describeFailure(error);
      availability.push({
        symbol,
        accessible: false,
        kind: failure.kind,
        message: failure.message,
      });
      console.log(`  ${symbol.padEnd(7)} ${failure.kind}: ${failure.message}`);
    }
  }

  const availabilityPath = await saveJson(outputDir, "fmp commodity_availability.json", {
    provider: "fmp",
    checked_at: new Date().toISOString(),
    account_restrictions:
      "See docs/FMP_COMMODITIES.md; 402 means the plan does not cover the symbol.",
    results: availability,
  });
  console.log(`  ✓ Wrote ${availabilityPath}`);

  return true;
}

async function runSymbols(
  outputDir: string,
  mode: "quote" | "history" | "all",
  symbols: string[],
  options: {
    range: DateWindow;
    chunkDays: number;
    write: boolean;
    saveRaw: boolean;
  },
): Promise<SymbolRunReport[]> {
  const catalog = await fetchCommodityCatalog();
  const reports: SymbolRunReport[] = [];

  for (const symbol of symbols) {
    const report = emptyReport(symbol);
    const identity = findListedCommodity(catalog.snapshot, symbol);
    report.listed = identity !== null;

    if (identity === null) {
      report.errors.push("symbol is not present in /commodities-list");
      reports.push(report);
      continue;
    }

    const reference = findCommodityReference(symbol);
    if (reference === null) {
      report.notes.push(
        "no curated classification for this symbol; asset metadata stays NULL rather than guessed",
      );
    }

    let quote: CommodityQuote | null = null;
    let quoteSourceUrl: string | null = null;

    if (mode === "quote" || mode === "all") {
      try {
        const result = await fetchCommodityQuote(symbol, { currency: identity.currency });
        quote = result.quote;
        quoteSourceUrl = result.source_url;
        report.quote = quote ? "ok" : "empty";

        if (result.rejection !== null) {
          report.notes.push(`quote not stored: ${result.rejection}`);
        }

        await saveJson(outputDir, `fmp commodity_quote_${symbol}.json`, {
          provider: "fmp",
          symbol,
          fetched_at: new Date().toISOString(),
          endpoint: QUOTE_ENDPOINT,
          source_url: result.source_url,
          quote,
          rejection: result.rejection,
          provider_raw: result.provider_raw,
        });
      } catch (error) {
        const failure = describeFailure(error);
        if (isPlanRestriction(failure.kind)) {
          report.restriction = failure.message;
        } else {
          report.errors.push(failure.message);
        }
      }
    }

    let candles: CommodityCandle[] = [];

    if ((mode === "history" || mode === "all") && report.restriction === null) {
      try {
        const result = await fetchCommodityHistory(symbol, options.range, {
          chunkDays: options.chunkDays,
          saveRaw: options.saveRaw,
        });
        candles = result.history.candles;
        report.history_candles = candles.length;
        report.history_windows = result.windows.length;
        report.history_rejected = result.history.rejected.length;

        const windowLabel = `${options.range.from}_${options.range.to}`;
        await saveJson(outputDir, `fmp commodity_history_${symbol}_${windowLabel}.json`, {
          ...result.history,
          windows: result.windows,
        });

        if (options.saveRaw) {
          await saveJson(outputDir, `fmp commodity_history_raw_${symbol}_${windowLabel}.json`, {
            provider: "fmp",
            symbol,
            fetched_at: result.history.fetched_at,
            requested: options.range,
            windows: result.provider_raw,
          });
        }

        if (candles.length === 0) {
          report.notes.push("provider returned no candles for the requested range");
        }
        if (result.history.rejected.length > 0) {
          report.notes.push(
            `dropped ${result.history.rejected.length} unusable row(s); see the history artifact`,
          );
        }
      } catch (error) {
        const failure = describeFailure(error);
        if (isPlanRestriction(failure.kind)) {
          report.restriction = failure.message;
        } else {
          report.errors.push(failure.message);
        }
      }
    }

    if (options.write && report.restriction === null && report.errors.length === 0) {
      try {
        report.persisted = await withTransaction((client) =>
          persistCommodity(client, {
            identity,
            quote,
            candles,
            quoteSourceUrl,
          }),
        );
      } catch (error) {
        report.errors.push(
          `database write failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    reports.push(report);
  }

  return reports;
}

async function runAvailability(outputDir: string, symbols: string[]): Promise<boolean> {
  const catalog = await fetchCommodityCatalog();
  const results: Array<Record<string, unknown>> = [];

  for (const symbol of symbols) {
    const identity = findListedCommodity(catalog.snapshot, symbol);

    if (identity === null) {
      results.push({ symbol, listed: false, accessible: false, kind: "not_listed" });
      console.log(`  ${symbol.padEnd(7)} not listed by the provider`);
      continue;
    }

    try {
      const result = await fetchCommodityQuote(symbol, { currency: identity.currency });
      results.push({
        symbol,
        listed: true,
        accessible: result.quote !== null,
        price: result.quote?.price ?? null,
        rejection: result.rejection,
      });
      console.log(
        `  ${symbol.padEnd(7)} ${result.quote ? `accessible price=${result.quote.price}` : `unusable: ${result.rejection}`}`,
      );
    } catch (error) {
      const failure = describeFailure(error);
      results.push({
        symbol,
        listed: true,
        accessible: false,
        kind: failure.kind,
        status: error instanceof FmpRequestError ? error.status : null,
        message: failure.message,
      });
      console.log(`  ${symbol.padEnd(7)} ${failure.kind}`);
    }
  }

  const filePath = await saveJson(outputDir, "fmp commodity_availability.json", {
    provider: "fmp",
    checked_at: new Date().toISOString(),
    endpoint: QUOTE_ENDPOINT,
    note: "402/restricted means the current plan does not include the symbol; it does not mean the symbol is unknown.",
    results,
  });

  console.log(`  ✓ Wrote ${filePath}`);
  return true;
}

async function runReadback(symbols: string[]): Promise<boolean> {
  const client = await pool.connect();

  try {
    const db = createDbClient(client);
    let missing = 0;

    for (const symbol of symbols) {
      const state = await readCommodityState(db, symbol, {
        recentCandles: 5,
        recentSnapshots: 2,
      });

      if (state.asset === null) {
        missing += 1;
        console.log(`\n${symbol}: not stored yet`);
        continue;
      }

      console.log(`\n${symbol}`);
      console.log(`  asset:   ${state.asset.id} ${state.asset.symbol} "${state.asset.name}"`);
      console.log(`  profile: ${JSON.stringify(state.profile)}`);
      console.log(
        `  history: ${state.price_history.candle_count} candle(s) ` +
          `${state.price_history.earliest ?? "-"} .. ${state.price_history.latest ?? "-"}`,
      );

      for (const candle of state.price_history.recent) {
        console.log(
          `    ${String(candle["timestamp"])} O=${candle["open"]} H=${candle["high"]} ` +
            `L=${candle["low"]} C=${candle["close"]} V=${candle["volume"] ?? "null"} ` +
            `ccy=${candle["quote_currency"] ?? "null"}`,
        );
      }

      console.log(`  snapshots: ${state.snapshots.length}`);
      for (const snapshot of state.snapshots) {
        const data = snapshot["data"] as Record<string, unknown> | undefined;
        console.log(
          `    ${String(snapshot["collected_at"])} price=${data?.["price"] ?? "null"} ` +
            `ccy=${data?.["currency"] ?? "null"} observed=${data?.["observed_at"] ?? "null"} ` +
            `symbol=${data?.["provider_symbol"] ?? "null"}`,
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
  console.log(`FMP commodity collector

Usage:
  npx tsx collectors/assets/commodities/fmpCommodityFetchers.ts --mode=all --symbols=GCUSD --write

Modes:
  catalog       Fetch /commodities-list and report default targets.
  quote         Fetch current quotes only.
  history       Fetch daily OHLC history only.
  all           catalog + quote + history (and database writes with --write).
  availability  Probe which symbols the current plan can quote.
  readback      Read stored commodity rows back (read-only).

Options:
  --symbols=GCUSD,SIUSD   Provider symbols (default: gold, silver, WTI, Brent,
                          natural gas, copper, aluminum).
  --from=YYYY-MM-DD       History start (default: --days before --to).
  --to=YYYY-MM-DD         History end (default: today, UTC).
  --days=365              Window length when --from is omitted.
  --chunk-days=365        Days per history request (provider caps at 5000 rows).
  --write                 Persist to assets.assets / commodities /
                          asset_price_history / information. Off by default.
  --save-raw=true         Keep provider rows alongside normalized artifacts.
  --probe                 With --mode=catalog, also probe quote access.
  --rpm=120               Requests per minute.
  --max-requests=100      Hard request budget for this run.
  --output-dir=...        Default collectors/assets/commodities/data.
  --help                  Show this message.

No credentials are stored or printed; FMP_API_KEY comes from the environment.
A 402 means the current plan does not include the symbol or endpoint. It is
reported as RESTRICTED and is never interpreted as "no data".
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
  const requestsPerMinute = parsePositiveInteger(getArg("rpm"), DEFAULT_SNAPSHOT_RPM, "rpm");
  const maxRequests = parsePositiveInteger(getArg("max-requests"), 100, "max-requests");
  const chunkDays = parsePositiveInteger(getArg("chunk-days"), DEFAULT_CHUNK_DAYS, "chunk-days");
  const days = parsePositiveInteger(getArg("days"), DEFAULT_DAYS, "days");
  const write = hasFlag("write");
  const saveRaw = getArg("save-raw") !== "false";

  setFmpRequestsPerMinute(requestsPerMinute);
  setFmpRequestBudget(maxRequests);
  resetFmpRequestUsage(maxRequests);

  await fs.mkdir(outputDir, { recursive: true });

  if (mode === "readback") {
    const symbols = parseSymbolList(getArg("symbols"), DEFAULT_COMMODITY_SYMBOLS);
    const ok = await runReadback(symbols);
    if (!ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (mode === "catalog") {
    const ok = await runCatalog(outputDir, hasFlag("probe"));
    if (!ok) {
      process.exitCode = 1;
    }
    console.log(`\nFMP requests this run: ${getFmpRequestUsage().used}/${maxRequests}`);
    return;
  }

  const symbols = parseSymbolList(getArg("symbols"), DEFAULT_COMMODITY_SYMBOLS);

  if (mode === "availability") {
    const ok = await runAvailability(outputDir, symbols);
    if (!ok) {
      process.exitCode = 1;
    }
    console.log(`\nFMP requests this run: ${getFmpRequestUsage().used}/${maxRequests}`);
    return;
  }

  const range = resolveDateRange({
    from: getArg("from"),
    to: getArg("to"),
    days,
  });

  console.log(
    `FMP commodities: mode=${mode} symbols=${symbols.join(",")} range=${range.from}..${range.to} ` +
      `write=${write ? "yes" : "no"}`,
  );

  const reports = await runSymbols(outputDir, mode, symbols, {
    range,
    chunkDays,
    write,
    saveRaw,
  });

  printReport(reports, getFmpRequestUsage());

  const unexpected = reports.filter((report) => report.errors.length > 0);
  const restricted = reports.filter((report) => report.restriction !== null);
  const stored = reports.filter((report) => report.persisted !== null);

  console.log(
    `\n${reports.length - unexpected.length - restricted.length}/${reports.length} symbol(s) collected` +
      (stored.length > 0 ? `, ${stored.length} persisted` : "") +
      (restricted.length > 0 ? `, ${restricted.length} restricted by plan` : ""),
  );

  if (unexpected.length > 0) {
    console.error(`${unexpected.length} symbol(s) failed unexpectedly.`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("FMP commodity collection failed:", message);
    process.exitCode = 1;
  });
}
