/**
 * Stock Ticker Collector
 *
 * Fetches the SEC exchange-aware company tickers list from:
 *   https://www.sec.gov/files/company_tickers_exchange.json
 *
 * The response is `{ fields: [...], data: [[cik, name, ticker, exchange], ...] }`.
 * It is normalized into the keyed object consumed by the asset search:
 *
 *   collectors/assets/tickers/data/stock-tickers.json
 *     { "<index>": { cik_str, ticker, title, exchange, tradingViewExchange } }
 *
 * `exchange` keeps the SEC label; `tradingViewExchange` is the matching
 * TradingView code, or null when the listing has no TradingView equivalent.
 *
 * Run with:
 *   npx tsx collectors/assets/tickers/stockTicker.ts
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SEC_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/tickers/data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "stock-tickers.json");

/**
 * SEC exchange label -> TradingView exchange code.
 *
 * Only mappings that were checked against TradingView belong here. TXSE (Texas
 * Stock Exchange) has no TradingView listing, so it maps to null.
 */
const SEC_EXCHANGE_TO_TRADINGVIEW: Readonly<Record<string, string | null>> = {
  Nasdaq: "NASDAQ",
  NYSE: "NYSE",
  OTC: "OTC",
  CBOE: "CBOE",
  TXSE: null,
};

export interface StockTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
  exchange: string | null;
  tradingViewExchange: string | null;
}

export type StockTickerFile = Record<string, StockTickerEntry>;

interface SecCompanyTickersExchangeResponse {
  fields: string[];
  data: Array<Array<string | number | null>>;
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

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Maps an SEC exchange label to its TradingView code, or null when unsupported. */
export function mapSecExchangeToTradingView(exchange: string | null): string | null {
  if (!exchange) {
    return null;
  }
  return SEC_EXCHANGE_TO_TRADINGVIEW[exchange.trim()] ?? null;
}

/**
 * Normalizes the SEC response into the keyed object used by the frontend.
 *
 * The provider uses a columnar shape (`fields` + `data`), so columns are looked
 * up by name instead of assuming a fixed order. Rows without a CIK, ticker or
 * name are skipped rather than written as partial entries.
 */
export function normalizeSecCompanyTickers(payload: unknown): StockTickerFile {
  if (!isRecord(payload)) {
    throw new Error("SEC company tickers response is not an object.");
  }

  const fields = Array.isArray(payload["fields"]) ? payload["fields"].map(String) : [];
  const rows = Array.isArray(payload["data"]) ? payload["data"] : [];

  const cikIndex = fields.indexOf("cik");
  const nameIndex = fields.indexOf("name");
  const tickerIndex = fields.indexOf("ticker");
  const exchangeIndex = fields.indexOf("exchange");

  if (cikIndex < 0 || nameIndex < 0 || tickerIndex < 0) {
    throw new Error(
      `SEC company tickers response is missing required fields (got: ${fields.join(", ")}).`,
    );
  }

  const entries: StockTickerFile = {};
  let position = 0;

  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue;
    }

    const cik = numberOrNull(row[cikIndex]);
    const ticker = stringOrNull(row[tickerIndex]);
    const title = stringOrNull(row[nameIndex]);

    if (cik === null || !ticker || !title) {
      continue;
    }

    const exchange = exchangeIndex >= 0 ? stringOrNull(row[exchangeIndex]) : null;

    entries[String(position)] = {
      cik_str: cik,
      ticker,
      title,
      exchange,
      tradingViewExchange: mapSecExchangeToTradingView(exchange),
    };
    position += 1;
  }

  return entries;
}

/**
 * Fetches the SEC company tickers JSON.
 * SEC requires a User-Agent header identifying the requester.
 */
export async function fetchSecCompanyTickers(): Promise<SecCompanyTickersExchangeResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(SEC_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "crypto-intelligence-backend contact@example.com",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`SEC request failed: ${response.status} ${response.statusText}`);
    }

    const data: unknown = await response.json();
    if (!isRecord(data) || !Array.isArray(data["fields"]) || !Array.isArray(data["data"])) {
      throw new Error("SEC company tickers response has an unexpected shape.");
    }

    return {
      fields: data["fields"].map(String),
      data: data["data"] as Array<Array<string | number | null>>,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Writes the canonical ticker file atomically so a failed run leaves the old file intact. */
export async function writeStockTickersFile(
  data: StockTickerFile,
  filePath: string = OUTPUT_FILE,
): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  await fs.rename(tempPath, filePath);

  console.log(`[STOCK_TICKER] Wrote ${filePath}`);
  return filePath;
}

function summarizeExchanges(entries: StockTickerFile): string {
  const counts = new Map<string, number>();

  for (const entry of Object.values(entries)) {
    const label = entry.exchange ?? "unknown";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${label}=${count.toLocaleString("en-US")}`)
    .join(", ");
}

async function main(): Promise<void> {
  console.log("[STOCK_TICKER] Fetching SEC exchange-aware company tickers...");

  const payload = await fetchSecCompanyTickers();
  const entries = normalizeSecCompanyTickers(payload);
  const count = Object.keys(entries).length;

  if (count === 0) {
    throw new Error("SEC response contained no usable rows; keeping the existing file.");
  }

  const filePath = await writeStockTickersFile(entries);
  const withoutTradingView = Object.values(entries).filter(
    (entry) => entry.tradingViewExchange === null,
  ).length;

  console.log(
    `[STOCK_TICKER] ${count.toLocaleString("en-US")} ticker(s); ` +
      `${withoutTradingView.toLocaleString("en-US")} without a TradingView exchange.`,
  );
  console.log(`[STOCK_TICKER] Exchanges: ${summarizeExchanges(entries)}`);
  console.log(`[STOCK_TICKER] Done. Output: ${filePath}`);
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("[STOCK_TICKER] Failed:", error);
    process.exitCode = 1;
  });
}
