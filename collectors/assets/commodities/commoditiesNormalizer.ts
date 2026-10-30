/**
 * Commodity Intelligence Normalizer
 *
 * Fetches raw commodity intelligence data from providers and normalizes it into
 * the target output structure:
 *
 *   collectors/assets/data/commodities_intelligence_<SYMBOL>_<timestamp>.json
 *
 * Data sources:
 *   - FMP /quote?symbol=...          → current market snapshot
 *   - FMP /historical-price-eod/full → daily OHLCV candles
 *   - commodityReference.ts          → curated classification (type, benchmark, etc.)
 *
 * Run with: npx tsx collectors/assets/commodities/commoditiesNormalizer.ts --symbol=GCUSD
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import {
  fetchCommodityCatalog,
  fetchCommodityHistory,
  fetchCommodityQuote,
  type CommodityHistoryFetch,
  type CommodityQuoteFetch,
  type DateWindow,
  resolveDateRange,
} from "./fmpCommodityFetchers.js";
import {
  findCommodityReference,
  type CommodityReference,
} from "./commodityReference.js";
import {
  findListedCommodity,
} from "./fmpCommodityNormalizer.js";
import type { CommodityCandle, CommodityQuote } from "../../../types/FMP/fmpCommodity.types.js";
import type { CommodityListSnapshot } from "../../../types/FMP/fmpCommodity.types.js";
import type { CommodityIdentity } from "../../../types/FMP/fmpCommodity.types.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/commodities/data");

/* ============================================================================
 * OUTPUT TYPES (matching the target API response shape)
 * ============================================================================ */

export interface CommodityExternalIds {
  fmpSymbol: string;
}

export interface CommodityAsset {
  name: string;
  symbol: string;
  category: string | null;
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  externalIds: CommodityExternalIds;
}

export interface CommodityContract {
  exchange: string | null;
  tradeMonth: string | null;
  contractYear: number | null;
}

export interface Commodity {
  type: string | null;
  benchmark: string | null;
  currency: string | null;
  unitOfMeasure: string | null;
  uses: string[];
  contract: CommodityContract;
}

export interface CommodityMarket {
  price: number | null;
  currency: string;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  volume: number | null;
  vwap: number | null;
  movingAverages: { sma50: number | null; sma200: number | null };
  priceUpdatedAt: string | null;
  source: string | null;
}

export interface CommodityMarketFull extends CommodityMarket {
  yearLowDate: string | null;
  priceChange7d: number | null;
  priceChange90d: number | null;
}

export interface CommodityFundamentals {
  valueDrivers: Record<string, unknown>;
  supplyDemand: Record<string, unknown>;
  inflation: Record<string, unknown>;
}

export interface CommodityHistory {
  interval: string;
  firstObservation: string | null;
  lastObservation: string | null;
  observationCount: number | null;
  lastUpdatedAt: string | null;
}

export interface CommodityIntelligenceData {
  symbol: string;
  asset: CommodityAsset;
  commodity: Commodity;
  market: CommodityMarketFull;
  fundamentals: CommodityFundamentals;
  history: CommodityHistory;
  dataUpdatedAt: string | null;
}

/* ============================================================================
 * FETCHER
 * ============================================================================ */

/**
 * Raw data returned by providers before normalization.
 */
interface RawCommodityIntelligence {
  quote: CommodityQuote | null;
  history: CommodityHistoryFetch | null;
  reference: CommodityReference | null;
  catalogIdentity: CommodityIdentity | null;
}

/**
 * Fetches all raw commodity intelligence data for a symbol.
 *
 * 1. FMP /quote?symbol=...      → current market snapshot
 * 2. FMP /historical-price-eod/full → daily OHLCV candles
 * 3. commodityReference.ts    → curated classification
 *
 * Saves each raw response to collectors/assets/commodities/data/ for audit.
 */
export async function fetchCommodityIntelligence(symbol: string): Promise<RawCommodityIntelligence> {
  const cleanSymbol = symbol.trim().toUpperCase();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let quote: CommodityQuote | null = null;
  let history: CommodityHistoryFetch | null = null;
  let reference: CommodityReference | null = null;
  let catalogIdentity: CommodityIdentity | null = null;

  // --- 1. FMP quote (current market snapshot) ---
  try {
    const result = await fetchCommodityQuote(cleanSymbol);
    quote = result.quote;
    await fs.writeFile(
      path.join(OUTPUT_DIR, `fmp commodity_quote_${cleanSymbol}.json`),
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(`  ✓ FMP quote for ${cleanSymbol}: ${result.quote?.price ?? "no price"}`);
  } catch (error) {
    console.error(`  ✗ FMP quote failed for ${cleanSymbol}:`, error);
  }

  // --- 2. FMP historical price EOD full (daily OHLCV candles) ---
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const result = await fetchCommodityHistory(cleanSymbol, { from, to }, { chunkDays: 365 });
    history = result;
    await fs.writeFile(
      path.join(OUTPUT_DIR, `fmp commodity_history_${cleanSymbol}_${from}_${to}.json`),
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(`  ✓ FMP history for ${cleanSymbol}: ${result.history.candles.length} candles`);
  } catch (error) {
    console.error(`  ✗ FMP history failed for ${cleanSymbol}:`, error);
  }

  // --- 3. Curated reference (type, benchmark, etc.) ---
  try {
    reference = findCommodityReference(cleanSymbol);
    console.log(`  ✓ Reference for ${cleanSymbol}: ${reference?.display_name ?? "not found"}`);
  } catch (error) {
    console.error(`  ✗ Reference lookup failed for ${cleanSymbol}:`, error);
  }

  // --- 4. Commodity catalog identity (tradeMonth, currency) ---
  try {
    const { fetchCommodityCatalog } = await import("./fmpCommodityFetchers.js");
    const catalogResult = await fetchCommodityCatalog();
    const catalog = catalogResult.snapshot;
    catalogIdentity = findListedCommodity(catalog, cleanSymbol);
    console.log(`  ✓ Catalog identity for ${cleanSymbol}: ${catalogIdentity?.provider_name ?? "not found"}`);
  } catch (error) {
    console.error(`  ✗ Commodity catalog fetch failed for ${cleanSymbol}:`, error);
  }

  return { quote, history, reference, catalogIdentity };
}

/* ============================================================================
 * NORMALIZER
 * ============================================================================ */

/**
 * Normalizes raw provider data into the target commodity intelligence output shape.
 */
export function normalizeCommodityIntelligence(
  raw: RawCommodityIntelligence,
  symbol: string,
): CommodityIntelligenceData {
  const cleanSymbol = symbol.trim().toUpperCase();
  const now = new Date().toISOString();

  const quote = raw.quote;
  const history = raw.history;
  const reference = raw.reference;
  const catalogIdentity = raw.catalogIdentity;

  // --- Asset ---
  const asset = normalizeAsset(quote, reference, cleanSymbol);

  // --- Commodity metadata ---
  const commodity = normalizeCommodity(quote, reference, catalogIdentity, cleanSymbol);

  // --- Market ---
  const market = normalizeMarket(quote, history);

  // --- Fundamentals ---
  const fundamentals = normalizeFundamentals();

  // --- History ---
  const historyData = normalizeHistory(history);

  // --- dataUpdatedAt ---
  const timestamps: string[] = [];
  if (quote?.collected_at) timestamps.push(quote.collected_at);
  if (history?.history.fetched_at) timestamps.push(history.history.fetched_at);
  const dataUpdatedAt =
    timestamps.length > 0
      ? timestamps.reduce((latest, current) => (current > latest ? current : latest))
        : now;

  return {
    symbol: cleanSymbol,
    asset,
    commodity,
    market,
    fundamentals,
    history: historyData,
    dataUpdatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/*                           Individual Normalizers                           */
/* -------------------------------------------------------------------------- */

/**
 * Normalizes the asset block from provider quote + curated reference.
 */
function normalizeAsset(
  quote: CommodityQuote | null | undefined,
  reference: CommodityReference | null,
  symbol: string,
): CommodityAsset {
  const name =
    quote?.name ??
    reference?.display_name ??
    symbol;

  return {
    name,
    symbol: symbol.trim().toUpperCase(),
    category: null, // FMP does not provide asset category; stored as null
    description: null, // FMP does not provide commodity descriptions
    logoUrl: null, // FMP does not provide commodity logos
    website: null, // FMP does not provide commodity websites
    externalIds: {
      fmpSymbol: quote?.provider_symbol ?? symbol,
    },
  };
}

/**
 * Normalizes the commodity metadata block from provider quote + curated reference.
 */
function normalizeCommodity(
  quote: CommodityQuote | null | undefined,
  reference: CommodityReference | null,
  catalogIdentity: CommodityIdentity | null,
  symbol: string,
): Commodity {
  const referenceType = reference?.commodity_type;
  const referenceBenchmark = reference?.benchmark;
  const referenceCurrency = catalogIdentity?.currency ?? quote?.currency;
  const referenceTradeMonth = catalogIdentity?.trade_month ?? null;

  return {
    type: referenceType ? capitalizeFirst(referenceType) : null,
    benchmark: referenceBenchmark ?? null,
    currency: referenceCurrency ?? null,
    unitOfMeasure: null, // FMP does not document contract size or units
    uses: [],
    contract: {
      exchange: quote?.exchange ?? null,
      tradeMonth: referenceTradeMonth,
      contractYear: null,
    },
  };
}

/**
 * Capitalizes the first letter of a string for display.
 */
function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Normalizes the market block from provider quote + historical candles.
 *
 * FMP quote is the primary source for price/24hr data. Missing fields
 * (allTimeLow, allTimeLowDate, priceChange7d, priceChange90d) are calculated
 * from historical candles.
 */
function normalizeMarket(
  quote: CommodityQuote | null | undefined,
  history: CommodityHistoryFetch | null | undefined,
): CommodityMarketFull {
  const price = quote?.price ?? null;
  const change = quote?.change ?? null;
  const changePercent = quote?.change_percent ?? null;
  const previousClose = quote?.previous_close ?? null;
  const open = quote?.open ?? null;
  const dayHigh = quote?.day_high ?? null;
  const dayLow = quote?.day_low ?? null;
  const yearHigh = quote?.year_high ?? null;
  const yearLow = quote?.year_low ?? null;
  const volume = quote?.volume ?? null;
  const vwap = null; // FMP does not provide VWAP in quote
  const movingAverages = {
    sma50: quote?.price_avg_50 ?? null,
    sma200: quote?.price_avg_200 ?? null,
  };

  // --- Missing fields calculated from klines ---
  const {
    allTimeLow,
    allTimeLowDate,
    priceChange7d,
    priceChange90d,
  } = calculateMissingMarketData(history?.history?.candles ?? [], price);

  // Use kline-derived values when provider fields are missing
  const finalYearLow = yearLow ?? allTimeLow;

  return {
    price,
    currency: "USD",
    change,
    changePercent,
    previousClose,
    open,
    dayHigh,
    dayLow,
    yearHigh,
    yearLow: finalYearLow,
    volume,
    vwap,
    movingAverages,
    priceUpdatedAt: quote?.observed_at ?? null,
    source: "FMP",
    yearLowDate: allTimeLowDate,
    priceChange7d,
    priceChange90d,
  };
}

/**
 * Calculates missing market data values from historical candles.
 *
 * From klines we can derive:
 *   - allTimeLow: lowest low across all stored candles
 *   - allTimeLowDate: date of the candle with the lowest low
 *   - priceChange7d: percent change from close 7 days ago to most recent close
 *   - priceChange90d: percent change from close 90 days ago to most recent close
 */
function calculateMissingMarketData(
  candles: CommodityCandle[] | undefined,
  currentPrice: number | null,
): {
  allTimeLow: number | null;
  allTimeLowDate: string | null;
  priceChange7d: number | null;
  priceChange90d: number | null;
} {
  if (!candles || candles.length === 0) {
    return {
      allTimeLow: null,
      allTimeLowDate: null,
      priceChange7d: null,
      priceChange90d: null,
    };
  }

  // Sort candles by timestamp ascending (oldest first)
  const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Find all-time low (lowest low across all candles)
  let allTimeLow: number | null = null;
  let allTimeLowDate: string | null = null;
  for (const c of sorted) {
    const low = c.low;
    if (allTimeLow === null || low < allTimeLow) {
      allTimeLow = low;
      allTimeLowDate = c.date;
    }
  }

  // Most recent close price
  const mostRecent = sorted[sorted.length - 1];
  const mostRecentClose = mostRecent ? Number(mostRecent.close) : null;
  const effectivePrice = currentPrice ?? mostRecentClose ?? null;

  // priceChange7d: (most recent close - close 7 days ago) / close 7 days ago * 100
  let priceChange7d: number | null = null;
  if (effectivePrice !== null && sorted.length >= 2 && mostRecent) {
    // Find the candle closest to 7 days ago
    const sevenDaysAgo = new Date(mostRecent.timestamp).getTime() - 7 * 24 * 60 * 60 * 1000;
    const k7d = sorted.reduce((prev, curr) => {
      return Math.abs(new Date(curr.timestamp).getTime() - sevenDaysAgo) <
        Math.abs(new Date(prev.timestamp).getTime() - sevenDaysAgo)
        ? curr
        : prev;
    });
    const close7d = Number(k7d.close);
    if (close7d !== 0 && Number.isFinite(close7d)) {
      priceChange7d = ((effectivePrice - close7d) / close7d) * 100;
    }
  }

  // priceChange90d: (most recent close - close 90 days ago) / close 90 days ago * 100
  let priceChange90d: number | null = null;
  if (effectivePrice !== null && sorted.length >= 2 && mostRecent) {
    const ninetyDaysAgo = new Date(mostRecent.timestamp).getTime() - 90 * 24 * 60 * 60 * 1000;
    const k90d = sorted.reduce((prev, curr) => {
      return Math.abs(new Date(curr.timestamp).getTime() - ninetyDaysAgo) <
        Math.abs(new Date(prev.timestamp).getTime() - ninetyDaysAgo)
        ? curr
        : prev;
    });
    const close90d = Number(k90d.close);
    if (close90d !== 0 && Number.isFinite(close90d)) {
      priceChange90d = ((effectivePrice - close90d) / close90d) * 100;
    }
  }

  return {
    allTimeLow,
    allTimeLowDate,
    priceChange7d,
    priceChange90d,
  };
}

/**
 * Normalizes fundamentals block. FMP does not provide commodity fundamentals
 * (value drivers, supply/demand, inflation), so these are empty objects.
 */
function normalizeFundamentals(): CommodityFundamentals {
  return {
    valueDrivers: {},
    supplyDemand: {},
    inflation: {},
  };
}

/**
 * Normalizes history block from CommodityHistory candles.
 */
function normalizeHistory(
  history: CommodityHistoryFetch | null | undefined,
): CommodityHistory {
  if (!history || history.history.candles.length === 0) {
    return {
      interval: "1d",
      firstObservation: null,
      lastObservation: null,
      observationCount: null,
      lastUpdatedAt: null,
    };
  }

  const sorted = [...history.history.candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return {
    interval: "1d",
    firstObservation: first?.date ?? null,
    lastObservation: last?.date ?? null,
    observationCount: sorted.length,
    lastUpdatedAt: history.history.fetched_at ?? null,
  };
}

/* ============================================================================
 * MAIN (direct run)
 * ============================================================================ */

async function main(symbol: string): Promise<void> {
  console.log(`Fetching commodity intelligence for ${symbol}...\n`);
  const raw = await fetchCommodityIntelligence(symbol);
  const data = normalizeCommodityIntelligence(raw, symbol);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `commodities_intelligence_${data.symbol}_${timestamp}.json`;
  const filepath = path.join("collectors/assets/data", filename);
  await fs.writeFile(filepath, JSON.stringify(data, null, 2) + "\n");

  console.log(`\nOutput written to: ${filepath}`);
  console.log(`  symbol: ${data.symbol}`);
  console.log(`  asset: ${data.asset.name} (${data.asset.symbol})`);
  console.log(`  commodity type: ${data.commodity.type}`);
  console.log(`  market price: $${data.market.price ?? "N/A"}`);
  console.log(`  allTimeHigh: $${data.market.yearHigh ?? "N/A"}`);
  console.log(`  allTimeLow: $${data.market.yearLow ?? "N/A"} (${data.market.yearLowDate ?? "N/A"})`);
  console.log(`  priceChange7d: ${data.market.priceChange7d ?? "N/A"}%`);
  console.log(`  priceChange90d: ${data.market.priceChange90d ?? "N/A"}%`);
}

const args = process.argv.slice(2);
const symbolArg = args.find((a) => a.startsWith("--symbol="));
const symbol = symbolArg ? symbolArg.split("=")[1] ?? "GCUSD" : "GCUSD";

if (import.meta.main) {
  main(symbol).catch((error) => {
    console.error("Commodity intelligence collection failed:", error);
    process.exitCode = 1;
  });
}
