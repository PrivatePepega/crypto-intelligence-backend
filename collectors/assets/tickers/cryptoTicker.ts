/**
 * Crypto Ticker Collector
 *
 * Builds the crypto autocomplete list and enriches coins with a liquid
 * USD/USDT trading pair plus the TradingView exchange code for that pair.
 *
 * Sources:
 *   GET /coins/list          -> { id, symbol, name }
 *   GET /coins/{id}/tickers  -> market pairs, filtered to supported exchanges
 *   GET /coins/markets       -> market-cap order used to choose which coins to enrich
 *
 * Output:
 *   collectors/assets/tickers/data/crypto-tickers.json
 *     [{ id, symbol, name, pair, exchange, tradingViewSymbol, tradeUrl, updatedAt }]
 *
 * A coin's CoinGecko id is the lookup key. Not every coin has a USD/USDT pair on
 * an exchange that TradingView lists; those entries keep `pair`, `exchange`,
 * `tradingViewSymbol` and `tradeUrl` as null so the attempt is visible.
 *
 * Pair enrichment costs one request per coin. The default run walks the top
 * `--limit` (250) market-cap coins that still need enrichment, and the file is
 * written atomically during the run so an interrupted run can be resumed.
 *
 * Run with:
 *   npx tsx collectors/assets/tickers/cryptoTicker.ts
 *   npx tsx collectors/assets/tickers/cryptoTicker.ts --mode=list
 *   npx tsx collectors/assets/tickers/cryptoTicker.ts --mode=pairs --limit=1000
 *   npx tsx collectors/assets/tickers/cryptoTicker.ts --mode=pairs --ids=bitcoin,ethereum
 *   npx tsx collectors/assets/tickers/cryptoTicker.ts --mode=pairs --all
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  fetchCoinGeckoCoinTickers,
  fetchCoinGeckoCoinsList,
  fetchCoinGeckoMarketIdsPage,
  setCoinGeckoRequestsPerMinute,
  type CoinGeckoMarketTicker,
} from "../crypto/coingeckoFetchers.js";

const DEFAULT_OUTPUT_FILE = path.resolve(
  process.cwd(),
  "collectors/assets/tickers/data/crypto-tickers.json",
);
const DEFAULT_LIMIT = 250;
const DEFAULT_REQUESTS_PER_MINUTE = 30;
const DEFAULT_VS_CURRENCY = "usd";
const MARKETS_PAGE_SIZE = 250;
const WRITE_EVERY_UPDATES = 25;

interface SupportedExchange {
  id: string;
  tradingView: string;
}

/**
 * Exchanges with verified TradingView spot symbols, in preference order.
 *
 * Earlier entries win when a coin trades on several of them. Only exchanges
 * whose spot symbols were checked against TradingView belong here; exchanges
 * that expose perpetual contracts only are deliberately absent.
 */
export const SUPPORTED_EXCHANGES: readonly SupportedExchange[] = [
  { id: "binance", tradingView: "BINANCE" },
  { id: "gdax", tradingView: "COINBASE" },
  { id: "kraken", tradingView: "KRAKEN" },
  { id: "okex", tradingView: "OKX" },
  { id: "bybit_spot", tradingView: "BYBIT" },
  { id: "bitstamp", tradingView: "BITSTAMP" },
  { id: "bitfinex", tradingView: "BITFINEX" },
  { id: "kucoin", tradingView: "KUCOIN" },
  { id: "gate", tradingView: "GATEIO" },
  { id: "crypto_com", tradingView: "CRYPTOCOM" },
  { id: "bitget", tradingView: "BITGET" },
  { id: "mxc", tradingView: "MEXC" },
  { id: "huobi", tradingView: "HTX" },
  { id: "gemini", tradingView: "GEMINI" },
  { id: "poloniex", tradingView: "POLONIEX" },
  { id: "whitebit", tradingView: "WHITEBIT" },
  { id: "phemex", tradingView: "PHEMEX" },
  { id: "bingx", tradingView: "BINGX" },
  { id: "bitrue", tradingView: "BITRUE" },
  { id: "coinw", tradingView: "COINW" },
  { id: "btse", tradingView: "BTSE" },
  { id: "upbit", tradingView: "UPBIT" },
  { id: "bithumb", tradingView: "BITHUMB" },
  { id: "binance_us", tradingView: "BINANCEUS" },
  { id: "bitso", tradingView: "BITSO" },
];

const EXCHANGE_PRIORITY = new Map(
  SUPPORTED_EXCHANGES.map((exchange, index) => [exchange.id, index] as const),
);
const SUPPORTED_EXCHANGE_IDS = SUPPORTED_EXCHANGES.map((exchange) => exchange.id);
const TARGET_PRIORITY: Readonly<Record<string, number>> = { USD: 0, USDT: 1 };
const TRUST_PRIORITY: Readonly<Record<string, number>> = {
  green: 3,
  yellow: 2,
  red: 1,
};

export interface CryptoTickerEntry {
  id: string;
  symbol: string;
  name: string;
  pair?: string | null;
  exchange?: string | null;
  tradingViewSymbol?: string | null;
  tradeUrl?: string | null;
  updatedAt?: string | null;
}

export interface SelectedCryptoPair {
  pair: string;
  exchange: string;
  tradingViewSymbol: string;
  tradeUrl: string | null;
}

export interface PairRunOptions {
  filePath: string;
  ids: string[] | null;
  all: boolean;
  limit: number;
  refresh: boolean;
  retryFailed: boolean;
  vsCurrency: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeBaseAsset(base: string): string {
  const upper = base.trim().toUpperCase();
  // Kraken reports Bitcoin as XBT; TradingView uses BTC.
  return upper === "XBT" ? "BTC" : upper;
}

interface PairCandidate {
  ticker: CoinGeckoMarketTicker;
  exchange: SupportedExchange;
  priority: number;
  targetRank: number;
}

function comparePairCandidates(a: PairCandidate, b: PairCandidate): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  if (a.targetRank !== b.targetRank) {
    return a.targetRank - b.targetRank;
  }

  const volumeDelta = (b.ticker.volumeUsd ?? -1) - (a.ticker.volumeUsd ?? -1);
  if (volumeDelta !== 0) {
    return volumeDelta;
  }

  const aTrust = TRUST_PRIORITY[a.ticker.trustScore?.toLowerCase() ?? ""] ?? 0;
  const bTrust = TRUST_PRIORITY[b.ticker.trustScore?.toLowerCase() ?? ""] ?? 0;
  if (aTrust !== bTrust) {
    return bTrust - aTrust;
  }

  return (b.ticker.lastTradedAt ?? "").localeCompare(a.ticker.lastTradedAt ?? "");
}

/**
 * Chooses the pair to map to TradingView.
 *
 * Preference: supported exchange, USD before USDT, higher converted USD volume,
 * then better trust score. Anomalous and stale rows are ignored. Returns null
 * when the coin has no USD/USDT pair on a supported exchange.
 */
export function selectTradingViewPair(
  tickers: readonly CoinGeckoMarketTicker[],
): SelectedCryptoPair | null {
  let best: PairCandidate | null = null;

  for (const ticker of tickers) {
    if (ticker.isAnomaly || ticker.isStale) {
      continue;
    }

    const target = ticker.target.trim().toUpperCase();
    const targetRank = TARGET_PRIORITY[target];
    if (targetRank === undefined) {
      continue;
    }

    const exchangeId = ticker.exchangeId.trim();
    const priority = EXCHANGE_PRIORITY.get(exchangeId);
    const exchange = priority === undefined ? undefined : SUPPORTED_EXCHANGES[priority];
    if (priority === undefined || exchange === undefined) {
      continue;
    }

    const candidate: PairCandidate = { ticker, exchange, priority, targetRank };
    if (best === null || comparePairCandidates(candidate, best) < 0) {
      best = candidate;
    }
  }

  if (best === null) {
    return null;
  }

  const base = normalizeBaseAsset(best.ticker.base);
  const target = best.ticker.target.trim().toUpperCase();
  if (!base) {
    return null;
  }

  return {
    pair: `${base}/${target}`,
    exchange: best.exchange.tradingView,
    tradingViewSymbol: `${best.exchange.tradingView}:${base}${target}`,
    tradeUrl: best.ticker.tradeUrl,
  };
}

/** Reads the existing ticker file, preserving enrichment fields. */
export async function readTickerFile(filePath: string): Promise<CryptoTickerEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (isRecord(error) && error["code"] === "ENOENT") {
      return [];
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Existing ticker file is not valid JSON: ${filePath}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Existing ticker file is not an array: ${filePath}`);
  }

  const entries: CryptoTickerEntry[] = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!isRecord(item)) {
      continue;
    }

    const id = stringOrNull(item["id"]);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);

    const entry: CryptoTickerEntry = {
      id,
      symbol: stringOrNull(item["symbol"]) ?? "",
      name: stringOrNull(item["name"]) ?? id,
    };

    for (const key of ["pair", "exchange", "tradingViewSymbol", "tradeUrl", "updatedAt"] as const) {
      if (hasOwn(item, key)) {
        entry[key] = stringOrNull(item[key]);
      }
    }

    entries.push(entry);
  }

  return entries;
}

/** Writes the ticker file atomically so an interrupted write cannot truncate it. */
export async function writeTickerFile(
  filePath: string,
  entries: readonly CryptoTickerEntry[],
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
  await fs.rename(tempPath, filePath);
}

/**
 * Refreshes the coin list while keeping enrichment for ids that still exist.
 *
 * The file is rebuilt from the provider's current list, so delisted ids are
 * dropped and new ids start without pair data.
 */
export async function refreshCoinList(filePath: string): Promise<CryptoTickerEntry[]> {
  console.log("[CRYPTO_TICKER] Fetching CoinGecko coins list...");

  const report = await fetchCoinGeckoCoinsList({ includePlatforms: false });
  const existing = new Map(
    (await readTickerFile(filePath)).map((entry) => [entry.id, entry] as const),
  );

  const entries: CryptoTickerEntry[] = [];
  let preserved = 0;

  for (const coin of report.coins) {
    const previous = existing.get(coin.coingeckoId);
    if (previous) {
      preserved += 1;
      entries.push(previous);
      continue;
    }

    entries.push({
      id: coin.coingeckoId,
      symbol: coin.symbol,
      name: coin.name,
    });
  }

  const freshIds = new Set(entries.map((entry) => entry.id));
  const dropped = [...existing.keys()].filter((id) => !freshIds.has(id)).length;

  await writeTickerFile(filePath, entries);
  console.log(
    `[CRYPTO_TICKER] Wrote ${entries.length.toLocaleString("en-US")} coin(s) ` +
      `(${preserved.toLocaleString("en-US")} kept enrichment, ` +
      `${dropped.toLocaleString("en-US")} delisted id(s) dropped) to ${filePath}`,
  );

  return entries;
}

function needsEnrichment(
  entry: CryptoTickerEntry | undefined,
  options: { refresh: boolean; retryFailed: boolean },
): boolean {
  if (!entry) {
    return false;
  }

  const attempted = entry.pair !== undefined || entry.exchange !== undefined;
  const resolved = typeof entry.exchange === "string" && entry.exchange.length > 0;

  if (options.refresh) {
    return true;
  }
  if (options.retryFailed) {
    return attempted && !resolved;
  }
  return !attempted;
}

async function resolveTargetIds(
  entries: readonly CryptoTickerEntry[],
  options: PairRunOptions,
): Promise<string[]> {
  if (options.ids && options.ids.length > 0) {
    return options.ids;
  }

  const selection = { refresh: options.refresh, retryFailed: options.retryFailed };

  if (options.all) {
    return entries.filter((entry) => needsEnrichment(entry, selection)).map((entry) => entry.id);
  }

  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
  const targets: string[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (targets.length < options.limit) {
    const result = await fetchCoinGeckoMarketIdsPage({
      page,
      perPage: MARKETS_PAGE_SIZE,
      vsCurrency: options.vsCurrency,
    });

    for (const id of result.ids) {
      if (targets.length >= options.limit) {
        break;
      }
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);

      if (needsEnrichment(byId.get(id), selection)) {
        targets.push(id);
      }
    }

    if (!result.hasMore || result.ids.length === 0) {
      break;
    }
    page += 1;
  }

  return targets;
}

export async function enrichPairs(
  options: PairRunOptions,
): Promise<{ updated: number; failed: number }> {
  const entries = await readTickerFile(options.filePath);
  if (entries.length === 0) {
    throw new Error(`No crypto tickers found at ${options.filePath}. Run --mode=list first.`);
  }

  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
  const requested = await resolveTargetIds(entries, options);
  const targets = requested.filter((id) => byId.has(id));
  const unknown = requested.filter((id) => !byId.has(id));

  if (unknown.length > 0) {
    console.warn(
      `[CRYPTO_TICKER] Skipping ${unknown.length} id(s) not in the ticker file: ` +
        `${unknown.slice(0, 10).join(", ")}${unknown.length > 10 ? ", ..." : ""}`,
    );
  }

  if (targets.length === 0) {
    console.log("[CRYPTO_TICKER] Nothing to enrich; the selected coins are already up to date.");
    return { updated: 0, failed: 0 };
  }

  console.log(`[CRYPTO_TICKER] Enriching ${targets.length.toLocaleString("en-US")} coin(s)...`);

  let updated = 0;
  let failed = 0;
  let pendingWrites = 0;

  for (const [index, id] of targets.entries()) {
    const entry = byId.get(id);
    if (!entry) {
      continue;
    }

    try {
      const report = await fetchCoinGeckoCoinTickers(id, {
        exchangeIds: SUPPORTED_EXCHANGE_IDS,
      });
      const selected = selectTradingViewPair(report.tickers);

      entry.pair = selected?.pair ?? null;
      entry.exchange = selected?.exchange ?? null;
      entry.tradingViewSymbol = selected?.tradingViewSymbol ?? null;
      entry.tradeUrl = selected?.tradeUrl ?? null;
      entry.updatedAt = report.fetchedAt;

      updated += 1;
      pendingWrites += 1;

      console.log(
        `[CRYPTO_TICKER] ${index + 1}/${targets.length} ${id} -> ` +
          (selected
            ? `${selected.tradingViewSymbol} (${selected.pair})`
            : "no supported USD/USDT pair"),
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[CRYPTO_TICKER] ${index + 1}/${targets.length} ${id} failed: ${message}`);
    }

    if (pendingWrites >= WRITE_EVERY_UPDATES) {
      await writeTickerFile(options.filePath, entries);
      pendingWrites = 0;
    }
  }

  await writeTickerFile(options.filePath, entries);
  return { updated, failed };
}

// --------------------------------------------------
// CLI
// --------------------------------------------------

const MODES = ["list", "pairs", "all"] as const;
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
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(`--${label} must be a positive integer, got "${value}".`);
  }
  return parsed;
}

function parseIds(value: string | null): string[] | null {
  if (value === null) {
    return null;
  }

  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");

  return ids.length > 0 ? [...new Set(ids)] : null;
}

function printHelp(): void {
  console.log(`Crypto ticker collector

Usage:
  npx tsx collectors/assets/tickers/cryptoTicker.ts

Modes:
  list    Refresh /coins/list into the ticker file, keeping existing enrichment.
  pairs   Enrich selected coins with a USD/USDT pair and TradingView exchange.
  all     list + pairs (default).

Options:
  --mode=all             Mode (default all).
  --limit=250            Market-cap coins to consider for pairs (default 250).
  --all                  Enrich every coin in the file; overrides --limit.
  --ids=bitcoin,ethereum Explicit CoinGecko ids; always fetched.
  --refresh              Re-fetch coins that already have a pair.
  --retry-failed         Re-fetch coins whose previous attempt found no pair.
  --vs=usd               Quote currency used for market-cap ordering.
  --rpm=30               Request rate per minute (Demo plan allows 30).
  --output=...           Default collectors/assets/tickers/data/crypto-tickers.json.
  --help                 Show this message.

Pair data is written atomically every ${WRITE_EVERY_UPDATES} updates, so an interrupted
run keeps its progress. Not every coin has a USD/USDT pair on a TradingView
listed exchange; those entries keep null pair fields.
`);
}

async function main(): Promise<void> {
  if (hasFlag("help") || hasFlag("h")) {
    printHelp();
    return;
  }

  const mode = parseMode(getArg("mode") ?? "all");
  const limit = parsePositiveInteger(getArg("limit"), DEFAULT_LIMIT, "limit");
  const rpm = parsePositiveInteger(getArg("rpm"), DEFAULT_REQUESTS_PER_MINUTE, "rpm");
  const vsCurrency = (getArg("vs") ?? DEFAULT_VS_CURRENCY).trim().toLowerCase();
  const outputPath = path.resolve(process.cwd(), getArg("output") ?? DEFAULT_OUTPUT_FILE);
  const all = hasFlag("all");
  const refresh = hasFlag("refresh");
  const retryFailed = hasFlag("retry-failed");
  const ids = parseIds(getArg("ids"));

  if (all && getArg("limit") !== null) {
    console.warn("[CRYPTO_TICKER] --all overrides --limit.");
  }

  setCoinGeckoRequestsPerMinute(rpm);

  console.log(`[CRYPTO_TICKER] mode=${mode} output=${outputPath} rpm=${rpm}`);

  if (mode === "list" || mode === "all") {
    await refreshCoinList(outputPath);
  }

  if (mode === "pairs" || mode === "all") {
    const result = await enrichPairs({
      filePath: outputPath,
      ids,
      all,
      limit,
      refresh,
      retryFailed,
      vsCurrency,
    });

    console.log(
      `[CRYPTO_TICKER] Enriched ${result.updated.toLocaleString("en-US")} coin(s); ` +
        `${result.failed.toLocaleString("en-US")} failed.`,
    );

    if (result.failed > 0) {
      process.exitCode = 1;
    }
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("[CRYPTO_TICKER] Failed:", error);
    process.exitCode = 1;
  });
}
