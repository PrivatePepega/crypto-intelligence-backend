/**
 * Energy Intelligence Normalizer
 *
 * Fetches raw energy intelligence data from the U.S. Energy Information
 * Administration (EIA) API and normalizes it into the target output structure:
 *
 *   collectors/assets/data/energy_intelligence_<SYMBOL>_<timestamp>.json
 *
 * Data sources:
 *   - EIA /v2/{route}/data?series_id=... → price observations (price series)
 *   - EIA /v2/{route}/data?series_id=... → supply/demand observations (fundamental series)
 *   - eiaSeriesCatalog.ts → curated classification (type, benchmark, etc.)
 *
 * Run with: npx tsx collectors/assets/energy/energyNormalizer.ts --symbol=RWTC
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import {
  fetchEnergySeries,
  type EnergySeriesFetch,
  type SeriesWindow,
  resolveSeriesWindow,
} from "./eiaFetchers.js";
import {
  findEiaSeries,
} from "./eiaSeriesCatalog.js";
import type { EiaSeriesDefinition } from "../../../types/EIA/eia.types.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/energy/data");

/**
 * Map of common energy ticker symbols to EIA series ids.
 */
const EIA_ID_BY_SYMBOL: Record<string, string> = {
  WTI: "RWTC",
  BRENT: "RBRTE",
  CRUDE_INVENTORY: "WCESTUS1",
  CRUDE_PRODUCTION: "WCRFPUS2",
  GASOLINE_SUPPLIED: "WGFUPUS2",
  DISTILLATE_SUPPLIED: "WDIUPUS2",
  REFINERY_UTILIZATION: "WPULEUS3",
  GAS_STORAGE: "NW2_EPG0_SWO_R48_BCF",
  GAS_PRODUCTION: "N9070US2",
  GAS_CONSUMPTION: "N9140US2",
};

/**
 * Resolves a ticker symbol to an EIA series id.
 * Falls back to the uppercased symbol itself if no mapping exists.
 */
function resolveEiaId(symbol: string): string {
  return EIA_ID_BY_SYMBOL[symbol] ?? symbol;
}

/* ============================================================================
 * OUTPUT TYPES (matching the target API response shape)
 * ============================================================================ */

export interface EnergyExternalIds {
  eiaSeriesId: string;
}

export interface EnergyAsset {
  name: string;
  symbol: string;
  category: string | null;
  description: string | null;
  website: string | null;
  externalIds: EnergyExternalIds;
}

export interface EnergyContract {
  exchange: string | null;
  tradeMonth: string | null;
  contractYear: number | null;
}

export interface Energy {
  type: string | null;
  benchmark: string | null;
  currency: string | null;
  unitOfMeasure: string | null;
  uses: string[];
  contract: EnergyContract;
}

export interface EnergyMarket {
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

export interface EnergyMarketFull extends EnergyMarket {
  yearLowDate: string | null;
  priceChange7d: number | null;
  priceChange90d: number | null;
}

export interface EnergyFundamentals {
  valueDrivers: Record<string, unknown>;
  supplyDemand: Record<string, unknown>;
  inflation: Record<string, unknown>;
}

export interface EnergyHistory {
  interval: string;
  firstObservation: string | null;
  lastObservation: string | null;
  observationCount: number | null;
  lastUpdatedAt: string | null;
}

export interface EnergyIntelligenceData {
  symbol: string;
  asset: EnergyAsset;
  commodity: Energy;
  market: EnergyMarketFull;
  fundamentals: EnergyFundamentals;
  history: EnergyHistory;
  dataUpdatedAt: string | null;
}

/* ============================================================================
 * FETCHER
 * ============================================================================ */

/**
 * Raw data returned by EIA before normalization.
 */
interface RawEnergyIntelligence {
  quote: EnergySeriesFetch | null;
  history: EnergySeriesFetch | null;
  reference: EiaSeriesDefinition | null;
}

/**
 * Fetches all raw energy intelligence data for a symbol.
 *
 * 1. EIA /v2/{route}/data?series_id=... → current price snapshot (price series)
 * 2. EIA /v2/{route}/data?series_id=... → supply/demand observations (fundamental series)
 * 3. EIA /v2/{route}/data?series_id=... → historical observations (price series)
 *
 * Saves each raw response to collectors/assets/energy/data/ for audit.
 */
export async function fetchEnergyIntelligence(symbol: string): Promise<RawEnergyIntelligence> {
  const cleanSymbol = symbol.trim().toUpperCase();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let quote: EnergySeriesFetch | null = null;
  let history: EnergySeriesFetch | null = null;
  let reference: EiaSeriesDefinition | null = null;

  // --- 1. Resolve EIA series id ---
  const eiaId = resolveEiaId(cleanSymbol);
  const definition = findEiaSeries(eiaId);
  if (!definition) {
    console.warn(`  ✗ No EIA series definition for ${cleanSymbol}`);
    return { quote: null, history: null, reference: null };
  }
  reference = definition;

  // --- 2. Fetch quote (latest observation) ---
  try {
    const window = resolveSeriesWindow(definition, {
      from: null,
      to: null,
    });
    const result = await fetchEnergySeries(definition, window, {
      pageSize: 1,
      maxRows: 1,
      direction: "desc",
    });
    quote = result;
    await fs.writeFile(
      path.join(OUTPUT_DIR, `eia quote_${cleanSymbol}.json`),
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(`  ✓ EIA quote for ${cleanSymbol}: ${result.result.observations.length ? result.result.observations[0]?.value : "no data"}`);
  } catch (error) {
    console.error(`  ✗ EIA quote failed for ${cleanSymbol}:`, error);
  }

  // --- 3. Fetch historical observations ---
  try {
    const window = resolveSeriesWindow(definition, {
      from: null,
      to: null,
    });
    const result = await fetchEnergySeries(definition, window, {
      pageSize: 5000,
      maxRows: 5000,
      direction: "asc",
    });
    history = result;
    await fs.writeFile(
      path.join(OUTPUT_DIR, `eia history_${cleanSymbol}.json`),
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(`  ✓ EIA history for ${cleanSymbol}: ${result.result.observations.length} observations`);
  } catch (error) {
    console.error(`  ✗ EIA history failed for ${cleanSymbol}:`, error);
  }

  return { quote, history, reference };
}

/* ============================================================================
 * NORMALIZER
 * ============================================================================ */

/**
 * Normalizes raw provider data into the target energy intelligence output shape.
 */
export function normalizeEnergyIntelligence(
  raw: RawEnergyIntelligence,
  symbol: string,
): EnergyIntelligenceData {
  const cleanSymbol = symbol.trim().toUpperCase();
  const now = new Date().toISOString();

  const quote = raw.quote;
  const history = raw.history;
  const reference = raw.reference;

  // --- Asset ---
  const asset = normalizeAsset(quote, reference, cleanSymbol);

  // --- Commodity metadata ---
  const commodity = normalizeCommodity(quote, reference);

  // --- Market ---
  const market = normalizeMarket(quote, history);

  // --- Fundamentals ---
  const fundamentals = normalizeFundamentals(quote, history);

  // --- History ---
  const historyData = normalizeHistory(history);

  // --- dataUpdatedAt ---
  const timestamps: string[] = [];
  if (quote?.result.fetched_at) timestamps.push(quote.result.fetched_at);
  if (history?.result.fetched_at) timestamps.push(history.result.fetched_at);
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
 * Normalizes EIA quote + reference into the asset object.
 */
function normalizeAsset(
  quote: EnergySeriesFetch | null,
  reference: EiaSeriesDefinition | null,
  symbol: string,
): EnergyAsset {
  const name =
    reference?.title ?? quote?.result.observations[0]?.series_name ?? symbol;

  return {
    name,
    symbol: cleanSymbol(symbol),
    category: null, // EIA does not provide asset category; stored as null
    description: reference?.title ?? null, // EIA title as description
    website: null, // EIA does not provide website
    externalIds: {
      eiaSeriesId: reference?.series_id ?? symbol,
    },
  };
}

function cleanSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Normalizes the commodity metadata block from reference data.
 */
function normalizeCommodity(
  quote: EnergySeriesFetch | null,
  reference: EiaSeriesDefinition | null,
): Energy {
  return {
    type: reference?.category ? capitalizeFirst(reference.category) : null,
    benchmark: reference?.asset_symbol ?? null,
    currency: null, // EIA does not provide currency in series metadata; unit is separate
    unitOfMeasure: reference?.unit ?? null,
    uses: [],
    contract: {
      exchange: null, // EIA does not provide exchange
      tradeMonth: null, // EIA does not provide trade month
      contractYear: null, // EIA does not provide contract year
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
 * Normalizes the market block from EIA quote observations.
 *
 * Price series (RWTC, RBRTE) have price data. Fundamental series do not.
 */
function normalizeMarket(
  quote: EnergySeriesFetch | null | undefined,
  history: EnergySeriesFetch | null | undefined,
): EnergyMarketFull {
  const latest = quote?.result.observations[quote.result.observations.length - 1];
  const price = latest?.value ?? null;
  const change = null; // EIA does not provide change in observations
  const changePercent = null; // EIA does not provide change percent
  const previousClose = null; // EIA does not provide previous close
  const open = null; // EIA does not provide open
  const dayHigh = null; // EIA does not provide day high
  const dayLow = null; // EIA does not provide day low
  const yearHigh = null; // EIA does not provide year high
  const yearLow = null; // Calculated from klines below
  const volume = null; // EIA does not provide volume
  const vwap = null; // EIA does not provide VWAP
  const movingAverages = { sma50: null, sma200: null }; // EIA does not provide moving averages

  // --- Missing fields calculated from klines ---
  const {
    allTimeLow,
    allTimeLowDate,
    priceChange7d,
    priceChange90d,
  } = calculateMissingMarketData(history?.result.observations ?? [], price);

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
    yearLow: allTimeLow,
    volume,
    vwap,
    movingAverages,
    priceUpdatedAt: latest?.collected_at ?? null,
    source: "EIA",
    yearLowDate: allTimeLowDate,
    priceChange7d,
    priceChange90d,
  };
}

/**
 * Calculates missing market data values from historical observations.
 *
 * From observations we can derive:
 *   - allTimeLow: lowest value across all observations
 *   - allTimeLowDate: period of the observation with the lowest value
 *   - priceChange7d: percent change from value 7 days ago to most recent
 *   - priceChange90d: percent change from value 90 days ago to most recent
 */
function calculateMissingMarketData(
  observations: EnergySeriesFetch["result"]["observations"] | undefined,
  currentPrice: number | null,
): {
  allTimeLow: number | null;
  allTimeLowDate: string | null;
  priceChange7d: number | null;
  priceChange90d: number | null;
} {
  if (!observations || observations.length === 0) {
    return {
      allTimeLow: null,
      allTimeLowDate: null,
      priceChange7d: null,
      priceChange90d: null,
    };
  }

  // Sort observations by period ascending (oldest first)
  const sorted = [...observations].sort((a, b) => a.period.localeCompare(b.period));

  // Find all-time low (lowest value across all observations)
  let allTimeLow: number | null = null;
  let allTimeLowDate: string | null = null;
  for (const obs of sorted) {
    const value = obs.value;
    if (allTimeLow === null || value < allTimeLow) {
      allTimeLow = value;
      allTimeLowDate = obs.period;
    }
  }

  // Most recent value
  const mostRecent = sorted[sorted.length - 1];
  const mostRecentValue = mostRecent ? mostRecent.value : null;
  const effectivePrice = currentPrice ?? mostRecentValue ?? null;

  // priceChange7d: (most recent value - value 7 days ago) / value 7 days ago * 100
  let priceChange7d: number | null = null;
  if (effectivePrice !== null && sorted.length >= 2 && mostRecent) {
    const mostRecentDate = new Date(mostRecent.period).getTime();
    const sevenDaysAgo = mostRecentDate - 7 * 24 * 60 * 60 * 1000;
    const k7d = sorted.reduce((prev, curr) => {
      return Math.abs(new Date(curr.period).getTime() - sevenDaysAgo) <
        Math.abs(new Date(prev.period).getTime() - sevenDaysAgo)
        ? curr
        : prev;
    });
    const close7d = Number(k7d.value);
    if (close7d !== 0 && Number.isFinite(close7d)) {
      priceChange7d = ((effectivePrice - close7d) / close7d) * 100;
    }
  }

  // priceChange90d: (most recent value - value 90 days ago) / value 90 days ago * 100
  let priceChange90d: number | null = null;
  if (effectivePrice !== null && sorted.length >= 2 && mostRecent) {
    const ninetyDaysAgo = new Date(mostRecent.period).getTime() - 90 * 24 * 60 * 60 * 1000;
    const k90d = sorted.reduce((prev, curr) => {
      return Math.abs(new Date(curr.period).getTime() - ninetyDaysAgo) <
        Math.abs(new Date(prev.period).getTime() - ninetyDaysAgo)
        ? curr
        : prev;
    });
    const close90d = Number(k90d.value);
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
 * Normalizes fundamentals block. EIA does not provide value drivers,
 * supply/demand breakdowns, or inflation data as structured fields.
 */
function normalizeFundamentals(
  quote: EnergySeriesFetch | null,
  history: EnergySeriesFetch | null,
): EnergyFundamentals {
  return {
    valueDrivers: {},
    supplyDemand: {},
    inflation: {},
  };
}

/**
 * Normalizes history block from EIA observations.
 */
function normalizeHistory(
  history: EnergySeriesFetch | null | undefined,
): EnergyHistory {
  if (!history || history.result.observations.length === 0) {
    return {
      interval: "1d",
      firstObservation: null,
      lastObservation: null,
      observationCount: null,
      lastUpdatedAt: null,
    };
  }

  const sorted = [...history.result.observations].sort((a, b) =>
    a.period.localeCompare(b.period),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return {
    interval: "1d",
    firstObservation: first?.period ?? null,
    lastObservation: last?.period ?? null,
    observationCount: sorted.length,
    lastUpdatedAt: history.result.fetched_at ?? null,
  };
}

/* ============================================================================
 * MAIN (direct run)
 * ============================================================================ */

async function main(symbol: string): Promise<void> {
  console.log(`Fetching energy intelligence for ${symbol}...\n`);
  const raw = await fetchEnergyIntelligence(symbol);
  const data = normalizeEnergyIntelligence(raw, symbol);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `energy_intelligence_${data.symbol}_${timestamp}.json`;
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
  console.log(`  history: ${data.history.observationCount ?? 0} observations`);
  console.log(`  dataUpdatedAt: ${data.dataUpdatedAt}`);
}

const args = process.argv.slice(2);
const symbolArg = args.find((a) => a.startsWith("--symbol="));
const symbol = symbolArg ? symbolArg.split("=")[1] ?? "RWTC" : "RWTC";

if (import.meta.main) {
  main(symbol).catch((error) => {
    console.error("Energy intelligence collection failed:", error);
    process.exitCode = 1;
  });
}
