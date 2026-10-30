/**
 * Stock Intelligence Collector Normalizer
 *
 * Fetches raw stock intelligence data from providers and normalizes it into
 * the target output structure used by the API:
 *
 *   collectors/assets/data/stocks_intelligence_<TICKER>_<timestamp>.json
 *
 * Data sources:
 *   - Company profile  → FMP  /profile?symbol=<TICKER>
 *   - Market quote     → FMP  /quote?symbol=<TICKER>
 *   - Historical prices→ FMP  /historical-price-eod/full?symbol=<TICKER>
 *   - Financial reports→ SEC  companyfacts/CIK<CIK>.json
 *
 * Run with: npx tsx collectors/assets/stocks/stockNormalizer.ts --ticker=AAPL
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import { fmpGet } from "../commodities/fmpClient.js";
import { padCik, fetchCompanyFacts } from "./secEdgarFetch.js";
import { loadAndNormalizeFacts, normalizeQuarterlyYTD } from "./fundamentalsCollector.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/data");

/* ============================================================================
 * OUTPUT TYPES (matching the target API response shape)
 * ============================================================================ */

export interface StockCompany {
  name: string;
  exchange: string | null;
  currency: string;
  cik: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  country: string;
  logoUrl: string | null;
  /** Market cap from provider quote, stored for read-back. */
  marketCap: number | null;
  /** Average volume from provider quote, stored for read-back. */
  averageVolume: number | null;
}

export interface StockCandle {
  symbol: string;
  date: string; // YYYY-MM-DD (trading date)
  timestamp: string; // date at UTC midnight, ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  change: number | null;
  changePercent: number | null;
  vwap: number | null;
}

export interface StockHistory {
  provider: "fmp";
  symbol: string;
  interval: "1d";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  candles: StockCandle[];
}

export interface StockMarket {
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  volume: number | null;
  averageVolume: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  priceUpdatedAt: string | null;
  movingAverages: { sma20: number | null; sma50: number | null; sma200: number | null };
}

export interface StockFinancialReport {
  form: "10-Q" | "10-K";
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  periodEnd: string | null;
  filingDate: string | null;
  accessionNumber: string | null;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  cashAndCashEquivalents: number | null;
  operatingCashFlow: number | null;
  capitalExpenditures: number | null;
  freeCashFlow: number | null;
  currency: "USD";
  sourceUrl: string | null;
}

export interface StockIntelligenceData {
  ticker: string;
  company: StockCompany;
  market: StockMarket;
  history: StockHistory | null;
  financialReports: { quarterly: StockFinancialReport[]; annual: StockFinancialReport[] };
  dataUpdatedAt: string | null;
}

/* ============================================================================
 * FETCHER
 * ============================================================================ */

/**
 * Raw data returned by providers before normalization.
 */
interface RawStockIntelligence {
  profile: Array<Record<string, unknown>> | null;
  quote: Array<Record<string, unknown>> | null;
  historicalPrices: Array<Record<string, unknown>> | null;
  companyfacts: Record<string, unknown> | null;
  cik: string | null;
}

/**
 * Fetches all raw stock intelligence data for a ticker.
 *
 * 1. FMP /profile  → company identity + CIK
 * 2. FMP /quote    → current market snapshot
 * 3. FMP /historical-price-eod/full → daily OHLCV candles
 * 4. SEC companyfacts → financial statement facts (using CIK from profile)
 *
 * Saves each raw response to collectors/assets/data/ for audit.
 */
export async function fetchStockIntelligence(ticker: string): Promise<RawStockIntelligence> {
  const cleanTicker = ticker.trim().toUpperCase();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let profile: Array<Record<string, unknown>> | null = null;
  let quote: Array<Record<string, unknown>> | null = null;
  let historicalPrices: Array<Record<string, unknown>> | null = null;
  let companyfacts: Record<string, unknown> | null = null;
  let cik: string | null = null;

  // --- 1. FMP profile (company identity + CIK) ---
  try {
    const result = await fmpGet("/profile", { symbol: cleanTicker }, `profile ${cleanTicker}`);
    if (Array.isArray(result.data) && result.data.length > 0) {
      profile = result.data as Array<Record<string, unknown>>;
      const first = profile[0];
      cik = (first?.["cik"] as string | null) ?? null;
      await fs.writeFile(
        path.join(OUTPUT_DIR, `fmp profile_${cleanTicker}.json`),
        JSON.stringify(profile, null, 2) + "\n",
      );
      console.log(`  ✓ FMP profile for ${cleanTicker} (CIK: ${cik})`);
    } else {
      console.warn(`  ✗ FMP profile returned empty for ${cleanTicker}`);
    }
  } catch (error) {
    console.error(`  ✗ FMP profile failed for ${cleanTicker}:`, error);
  }

  // --- 2. FMP quote (market snapshot) ---
  try {
    const result = await fmpGet("/quote", { symbol: cleanTicker }, `quote ${cleanTicker}`);
    if (Array.isArray(result.data) && result.data.length > 0) {
      quote = result.data as Array<Record<string, unknown>>;
      await fs.writeFile(
        path.join(OUTPUT_DIR, `fmp quote_${cleanTicker}.json`),
        JSON.stringify(quote, null, 2) + "\n",
      );
      console.log(`  ✓ FMP quote for ${cleanTicker}`);
    } else {
      console.warn(`  ✗ FMP quote returned empty for ${cleanTicker}`);
    }
  } catch (error) {
    console.error(`  ✗ FMP quote failed for ${cleanTicker}:`, error);
  }

  // --- 3. FMP historical price EOD full (daily OHLCV candles) ---
  try {
    const result = await fmpGet(
      "/historical-price-eod/full",
      { symbol: cleanTicker },
      `historical-price-eod/full ${cleanTicker}`,
    );
    if (Array.isArray(result.data) && result.data.length > 0) {
      historicalPrices = result.data as Array<Record<string, unknown>>;
      await fs.writeFile(
        path.join(OUTPUT_DIR, `fmp historical_price_eod_full_${cleanTicker}.json`),
        JSON.stringify(historicalPrices, null, 2) + "\n",
      );
      console.log(`  ✓ FMP historical prices for ${cleanTicker}: ${historicalPrices.length} candles`);
    } else {
      console.warn(`  ✗ FMP historical prices returned empty for ${cleanTicker}`);
    }
  } catch (error) {
    console.error(`  ✗ FMP historical prices failed for ${cleanTicker}:`, error);
  }

  // --- 4. SEC companyfacts (financial reports) ---
  if (cik) {
    try {
      await fetchCompanyFacts(cik);
      // fetchCompanyFacts saves as Edgar companyfacts_CIK<cik>.json using the
      // same (padded) CIK we pass in. Read from that exact path.
      const filePath = path.join(
        "collectors/assets/stocks/data",
        `Edgar companyfacts_CIK${cik}.json`,
      );
      const raw = JSON.parse(await fs.readFile(filePath, "utf-8"));
      companyfacts = raw as Record<string, unknown>;
      console.log(`  ✓ SEC companyfacts for CIK ${cik}`);
    } catch (error) {
      console.error(`  ✗ SEC companyfacts failed for CIK ${cik}:`, error);
    }
  } else {
    console.warn(`  ✗ Cannot fetch SEC companyfacts: no CIK for ${cleanTicker}`);
  }

  return { profile, quote, historicalPrices, companyfacts, cik };
}

/* ============================================================================
 * NORMALIZER
 * ============================================================================ */

/**
 * Normalizes raw provider data into the target stock intelligence output shape.
 */
export function normalizeStockIntelligence(
  raw: RawStockIntelligence,
  ticker: string,
): StockIntelligenceData {
  const cleanTicker = ticker.trim().toUpperCase();
  const now = new Date().toISOString();

  // --- Company ---
  const company = normalizeCompany(raw.profile, cleanTicker);

  // --- Market ---
  const market = normalizeMarket(raw.quote, cleanTicker);

  // Carry provider market data into company for DB persistence/read-back.
  // Profile values take precedence; quote values fill gaps only when present.
  company.marketCap = market.marketCap ?? company.marketCap;
  company.averageVolume = market.averageVolume ?? company.averageVolume;

  // --- History ---
  const history = normalizeHistory(raw.historicalPrices, cleanTicker);

  // --- Financial reports ---
  const financialReports = normalizeFinancialReports(raw.companyfacts);

  // --- dataUpdatedAt ---
  const timestamps: string[] = [];
  if (raw.profile?.[0]?.["timestamp"]) timestamps.push(String(raw.profile[0]["timestamp"]));
  if (raw.quote?.[0]?.["timestamp"]) {
    const ts = raw.quote[0]["timestamp"];
    if (typeof ts === "number") timestamps.push(new Date(ts * 1000).toISOString());
    else if (typeof ts === "string") timestamps.push(ts);
  }
  if (history?.candles.length) {
    timestamps.push(history.candles[history.candles.length - 1]?.timestamp ?? now);
  }
  const dataUpdatedAt = timestamps.length > 0
    ? timestamps.reduce((latest, current) => (current > latest ? current : latest))
    : now;

  return {
    ticker: cleanTicker,
    company,
    market,
    history,
    financialReports,
    dataUpdatedAt,
  };
}

/**
 * Normalizes FMP profile into the company object.
 * marketCap/averageVolume come from the provider quote and are populated
 * by normalizeStockIntelligence after both company and market are known.
 */
function normalizeCompany(
  profile: Array<Record<string, unknown>> | null,
  ticker: string,
): StockCompany {
  const p = profile?.[0] ?? {};
  return {
    name: (typeof p["companyName"] === "string" && p["companyName"] !== "")
      ? p["companyName"] as string
      : ticker,
    exchange: (typeof p["exchange"] === "string")
      ? (p["exchange"] as string)
      : null,
    currency: (typeof p["currency"] === "string" && p["currency"] !== "")
      ? (p["currency"] as string)
      : "USD",
    cik: (typeof p["cik"] === "string" && p["cik"] !== "")
      ? (p["cik"] as string)
      : "",
    sector: (typeof p["sector"] === "string" && p["sector"] !== "")
      ? (p["sector"] as string)
      : null,
    industry: (typeof p["industry"] === "string" && p["industry"] !== "")
      ? (p["industry"] as string)
      : null,
    description: (typeof p["description"] === "string" && p["description"] !== "")
      ? (p["description"] as string)
      : null,
    website: (typeof p["website"] === "string" && p["website"] !== "")
      ? (p["website"] as string)
      : null,
    country: (typeof p["country"] === "string" && p["country"] !== "")
      ? (p["country"] as string)
      : "US",
    logoUrl: (typeof p["image"] === "string" && p["image"] !== "")
      ? (p["image"] as string)
      : null,
    marketCap: p["marketCap"] != null ? Number(p["marketCap"]) : null,
    averageVolume: p["averageVolume"] != null ? Number(p["averageVolume"]) : null,
  };
}

/**
 * Normalizes FMP quote into the market object.
 */
function normalizeMarket(
  quote: Array<Record<string, unknown>> | null,
  ticker: string,
): StockMarket {
  const q = quote?.[0] ?? {};

  const price = finiteOrNull(q["price"]);
  const previousClose = finiteOrNull(q["previousClose"]);
  const change = finiteOrNull(q["change"]);
  const changePercent = finiteOrNull(q["changePercentage"]);
  const marketCap = finiteOrNull(q["marketCap"]);
  const volume = nonNegativeOrNull(q["volume"]);
  const averageVolume = nonNegativeOrNull(q["averageVolume"]);
  const dayHigh = finiteOrNull(q["dayHigh"]);
  const dayLow = finiteOrNull(q["dayLow"]);
  const yearHigh = finiteOrNull(q["yearHigh"]);
  const yearLow = finiteOrNull(q["yearLow"]);

  const timestamp = q["timestamp"];
  const priceUpdatedAt =
    typeof timestamp === "number"
      ? new Date(timestamp * 1000).toISOString()
      : typeof timestamp === "string"
        ? timestamp
        : null;

  const priceAvg50 = finiteOrNull(q["priceAvg50"]);
  const priceAvg200 = finiteOrNull(q["priceAvg200"]);

  // Simple moving averages from provider values when available.
  const movingAverages = {
    sma20: priceAvg50 !== null ? priceAvg50 : null,
    sma50: priceAvg50 !== null ? priceAvg50 : null,
    sma200: priceAvg200 !== null ? priceAvg200 : null,
  };

  return {
    price,
    previousClose,
    change,
    changePercent,
    marketCap,
    volume,
    averageVolume,
    dayHigh,
    dayLow,
    yearHigh,
    yearLow,
    priceUpdatedAt,
    movingAverages,
  };
}

/**
 * Normalizes FMP historical price EOD full data into daily candles.
 *
 * FMP `/historical-price-eod/full` returns rows newest-first with:
 *   symbol, date, open, high, low, close, volume, change, changePercent, vwap
 *
 * We store them oldest-first. If a row is missing optional fields (high, low,
 * volume, etc.) we fall back to the close price so the NOT NULL columns
 * (open, high, low, close) always have a value.
 */
function normalizeHistory(
  historicalPrices: Array<Record<string, unknown>> | null,
  ticker: string,
): StockHistory | null {
  if (!historicalPrices || historicalPrices.length === 0) {
    return null;
  }

  const candles: StockCandle[] = historicalPrices.map((row) => {
    const date = (typeof row["date"] === "string" && row["date"] !== "") ? row["date"] as string : "";
    const timestamp = date ? `${date}T00:00:00.000Z` : "";

    const close = finiteOrNull(row["close"]);
    // Fall back to close for required NOT NULL columns when missing.
    const open = finiteOrNull(row["open"]) ?? close ?? 0;
    const high = finiteOrNull(row["high"]) ?? close ?? 0;
    const low = finiteOrNull(row["low"]) ?? close ?? 0;
    const finalClose = close ?? open;

    const volume = nonNegativeOrNull(row["volume"]);
    const change = finiteOrNull(row["change"]);
    const changePercent = finiteOrNull(row["changePercent"]);
    const vwap = finiteOrNull(row["vwap"]);

    return {
      symbol: ticker,
      date,
      timestamp,
      open,
      high,
      low,
      close: finalClose,
      volume,
      change,
      changePercent,
      vwap,
    };
  });

  // Sort oldest-first
  candles.sort((a, b) => a.date.localeCompare(b.date));

  const effectiveFrom = candles[0]?.date ?? null;
  const effectiveTo = candles[candles.length - 1]?.date ?? null;

  return {
    provider: "fmp",
    symbol: ticker,
    interval: "1d",
    effectiveFrom,
    effectiveTo,
    candles,
  };
}

/**
 * Normalizes SEC companyfacts into quarterly + annual financial reports.
 */
function normalizeFinancialReports(
  companyfacts: Record<string, unknown> | null,
): { quarterly: StockFinancialReport[]; annual: StockFinancialReport[] } {
  if (!companyfacts) {
    return { quarterly: [], annual: [] };
  }

  // Write to a temp file so we can reuse loadAndNormalizeFacts
  const usgaap = (companyfacts["facts"] as Record<string, any> | undefined)?.["us-gaap"];
  if (!usgaap) {
    return { quarterly: [], annual: [] };
  }

  const KEY_CONCEPTS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "GrossProfit",
    "OperatingIncomeLoss",
    "NetIncomeLoss",
    "Assets",
    "Liabilities",
    "StockholdersEquity",
    "AssetsCurrent",
    "LiabilitiesCurrent",
    "LongTermDebt",
    "LongTermDebtCurrent",
    "CashAndCashEquivalentsAtCarryingValue",
    "NetCashProvidedByUsedInOperatingActivities",
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "InventoryNet",
    "AccountsReceivableNetCurrent",
  ] as const;

  interface NormalizedFact {
    concept: string;
    fy: number;
    fp: "FY" | "Q1" | "Q2" | "Q3" | "Q4";
    periodEnd: string;
    filingDate: string;
    accessionNumber: string;
    form: string;
    value: number | null;
    unit: string;
  }

  const normalized: NormalizedFact[] = [];
  for (const concept of KEY_CONCEPTS) {
    const entry = usgaap[concept];
    if (!entry || !entry.units?.USD) continue;
    for (const rawFact of entry.units.USD as any[]) {
      normalized.push({
        concept,
        fy: rawFact.fy,
        fp: rawFact.fp,
        periodEnd: rawFact.end,
        filingDate: rawFact.filed,
        accessionNumber: rawFact.accn,
        form: rawFact.form,
        value: rawFact.val,
        unit: "USD",
      });
    }
  }

  // Group by fy|fp
  const groups = new Map<string, NormalizedFact[]>();
  for (const fact of normalized) {
    const key = `${fact.fy}|${fact.fp}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(fact);
  }

  const periodMap = normalizeQuarterlyYTD(groups);

  // Build reports from normalized periods
  const quarterly: StockFinancialReport[] = [];
  const annual: StockFinancialReport[] = [];

  for (const [key, concepts] of periodMap) {
    const [fyStr, period] = key.split("|") as [string, "FY" | "Q1" | "Q2" | "Q3" | "Q4"];
    const fy = parseInt(fyStr, 10);

    // Find representative filing metadata from original facts
    const group = groups.get(key);
    if (!group) continue;
    const latestByFiling = [...group].sort(
      (a, b) => b.filingDate.localeCompare(a.filingDate),
    )[0];

    const report: StockFinancialReport = {
      form: period === "FY" ? "10-K" : "10-Q",
      fiscalYear: fy,
      fiscalPeriod: period,
      periodEnd: latestByFiling?.periodEnd ?? null,
      filingDate: latestByFiling?.filingDate ?? null,
      accessionNumber: latestByFiling?.accessionNumber ?? null,
      revenue: concepts.get("RevenueFromContractWithCustomerExcludingAssessedTax") ??
        concepts.get("Revenues") ?? null,
      grossProfit: concepts.get("GrossProfit") ?? null,
      operatingIncome: concepts.get("OperatingIncomeLoss") ?? null,
      netIncome: concepts.get("NetIncomeLoss") ?? null,
      totalAssets: concepts.get("Assets") ?? null,
      totalLiabilities: concepts.get("Liabilities") ?? null,
      cashAndCashEquivalents:
        concepts.get("CashAndCashEquivalentsAtCarryingValue") ?? null,
      operatingCashFlow:
        concepts.get("NetCashProvidedByUsedInOperatingActivities") ?? null,
      capitalExpenditures:
        concepts.get("PaymentsToAcquirePropertyPlantAndEquipment") ?? null,
      freeCashFlow: (() => {
        const ocf = concepts.get("NetCashProvidedByUsedInOperatingActivities") ?? null;
        const capex = concepts.get("PaymentsToAcquirePropertyPlantAndEquipment") ?? null;
        if (ocf !== null && capex !== null) return ocf - Math.abs(capex);
        return null;
      })(),
      currency: "USD",
      sourceUrl: latestByFiling?.accessionNumber
        ? `https://www.sec.gov/Archives/edgar/data/${(companyfacts["cik"] as string | number)
            .toString()
            .replace(/^0+/, "")}/${String(latestByFiling.accessionNumber).replace(/-/g, "")}/index.html`
        : null,
    };

    if (period === "FY") {
      annual.push(report);
    } else {
      quarterly.push(report);
    }
  }

  // Sort: annual by fiscal year desc, quarterly by fy desc then period desc
  annual.sort((a, b) => (b.fiscalYear ?? 0) - (a.fiscalYear ?? 0));
  const periodOrder: Record<string, number> = { FY: 5, Q4: 4, Q3: 3, Q2: 2, Q1: 1 };
  quarterly.sort((a, b) => {
    if ((b.fiscalYear ?? 0) !== (a.fiscalYear ?? 0)) return (b.fiscalYear ?? 0) - (a.fiscalYear ?? 0);
    return (periodOrder[b.fiscalPeriod ?? ""] ?? 0) - (periodOrder[a.fiscalPeriod ?? ""] ?? 0);
  });

  return { quarterly: quarterly.slice(0, 3), annual: annual.slice(0, 3) };
}

/* ============================================================================
 * HELPERS
 * ============================================================================ */

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeOrNull(value: unknown): number | null {
  const parsed = finiteOrNull(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

/* ============================================================================
 * MAIN (direct run)
 * ============================================================================ */

async function main(ticker: string): Promise<void> {
  console.log(`Fetching stock intelligence for ${ticker}...\n`);
  const raw = await fetchStockIntelligence(ticker);
  const data = normalizeStockIntelligence(raw, ticker);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `stocks_intelligence_${data.ticker}_${timestamp}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(filepath, JSON.stringify(data, null, 2) + "\n");

  console.log(`\nOutput written to: ${filepath}`);
  console.log(`  ticker: ${data.ticker}`);
  console.log(`  company: ${data.company.name} (${data.company.exchange})`);
  console.log(`  market price: ${data.market.price}`);
  console.log(`  history candles: ${data.history?.candles.length ?? 0}`);
  console.log(`  quarterly reports: ${data.financialReports.quarterly.length}`);
  console.log(`  annual reports: ${data.financialReports.annual.length}`);
}

const args = process.argv.slice(2);
const tickerArg = args.find((a) => a.startsWith("--ticker="));
const ticker = tickerArg ? tickerArg.split("=")[1] ?? "AAPL" : "AAPL";

if (import.meta.main) {
  main(ticker).catch((error) => {
    console.error("Stock intelligence collection failed:", error);
    process.exitCode = 1;
  });
}
