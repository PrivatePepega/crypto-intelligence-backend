/**
 * Stock Routes - Single GET /:ticker endpoint
 *
 * Deterministic stock intelligence flow:
 * 1. GET /api-v1/stocks/:ticker - takes a stock symbol (e.g., NVDA)
 * 2. Checks database for existing data and freshness
 * 3. If data is current -> returns it from the database
 * 4. If stale or missing -> fetches from providers via stockNormalizer,
 *    injects into the SQL database (assets, stocks, stock_financial_reports,
 *    asset_price_history), then returns data from the database
 * 5. If ticker is not legitimate -> returns an error
 *
 * Output file: collectors/assets/data/stocks_intelligence_<TICKER>_<timestamp>.json
 * All output data is read from the database tables in database/sql/assets/.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import pool from "../config/database.js";
import {
  fetchStockIntelligence,
  normalizeStockIntelligence,
  type StockIntelligenceData,
  type StockCompany,
  type StockMarket,
  type StockFinancialReport,
  type StockHistory,
} from "../collectors/assets/stocks/stockNormalizer.js";

const router = Router();

const DATA_OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/data");

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================ */

/**
 * Ensures the output directory exists
 */
async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(DATA_OUTPUT_DIR, { recursive: true }).catch((error) => {
    console.error("[STOCK_ROUTES] Failed to create output directory:", error);
  });
}

/**
 * Writes JSON response to collectors/assets/data/ with timestamp.
 * Output structure: stocks_intelligence_<TICKER>_<ISO-timestamp>.json
 */
async function writeResponseToFile(
  prefix: string,
  identifier: string,
  data: unknown
): Promise<string> {
  await ensureOutputDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${prefix}_${identifier}_${timestamp}.json`;
  const filepath = path.join(DATA_OUTPUT_DIR, filename);

  try {
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    console.log(`[STOCK_ROUTES] Response saved to: ${filepath}`);
    return filepath;
  } catch (error) {
    console.error(`[STOCK_ROUTES] Failed to write response file:`, error);
    return "";
  }
}

/**
 * Standardized error response
 */
function createErrorResponse(
  error: unknown,
  context: string,
  statusCode: number = 500
): { response: object; statusCode: number } {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`[STOCK_ROUTES] ${context} failed:`, message);
  if (stack) console.error(`[STOCK_ROUTES] ${context} stack:`, stack);

  let errorCode = "intelligence_failed";
  let httpStatus = statusCode;

  if (
    message.includes("not a recognized stock") ||
    message.includes("is an ETF/fund") ||
    message.includes("not a real ticker")
  ) {
    errorCode = "wrong_ticker";
    httpStatus = 404;
  } else if (message.includes("matches multiple") || message.includes("ambiguous")) {
    errorCode = "ambiguous_stock";
    httpStatus = 409;
  } else if (message.includes("validation")) {
    errorCode = "validation_failed";
    httpStatus = 400;
  }

  return {
    response: {
      error: errorCode,
      message: httpStatus >= 500 ? "Internal server error" : message,
      ...(process.env.NODE_ENV === "development" && { stack })
    },
    statusCode: httpStatus
  };
}

/* ============================================================================
 * DATABASE READ HELPERS
 * ============================================================================ */

/**
 * Checks whether the asset exists and whether its persisted data is current.
 * Returns { exists, fresh, assetId }.
 */
async function checkDbFreshness(ticker: string): Promise<{
  exists: boolean;
  fresh: boolean;
  assetId: string | null;
}> {
  const assetRes = await pool.query(
    `SELECT id FROM assets.assets WHERE symbol = $1 AND asset_type = 'stock' LIMIT 1`,
    [ticker]
  );

  if (assetRes.rows.length === 0) {
    return { exists: false, fresh: false, assetId: null };
  }

  const assetId = assetRes.rows[0]["id"] as string;

  // Check that we have profile + financial statements + at least one candle
  const checks = await Promise.all([
    pool.query(
      `SELECT 1 FROM assets.stocks WHERE asset_id = $1 AND financial_statements IS NOT NULL AND jsonb_typeof(financial_statements) = 'object' AND financial_statements <> '{}'::jsonb LIMIT 1`,
      [assetId]
    ),
    pool.query(
      `SELECT 1 FROM assets.asset_price_history WHERE asset_id = $1 AND interval = '1d' LIMIT 1`,
      [assetId]
    ),
    pool.query(
      `SELECT updated_at FROM assets.stocks WHERE asset_id = $1`,
      [assetId]
    ),
  ]);

  const hasStatements = checks[0].rows.length > 0;
  const hasCandles = checks[1].rows.length > 0;
  const profileRow = checks[2].rows[0];

  const updatedAt = profileRow?.["updated_at"];
  const isFresh = updatedAt
    ? Date.now() - new Date(updatedAt).getTime() <= 7 * 24 * 60 * 60 * 1000
    : false;

  return {
    exists: true,
    fresh: hasStatements && hasCandles && isFresh,
    assetId,
  };
}

/**
 * Reads the company profile from assets.assets + assets.stocks for a given assetId.
 */
async function readCompanyFromDB(assetId: string, ticker: string): Promise<StockCompany> {
  const res = await pool.query(
    `SELECT a.name, a.external_ids, s.exchange, s.sector, s.industry,
            s.business_summary, s.currency, s.country, a.website_url, a.logo_url
     FROM assets.assets a
     LEFT JOIN assets.stocks s ON s.asset_id = a.id
     WHERE a.id = $1 AND a.asset_type = 'stock'`,
    [assetId]
  );

  const row = res.rows[0];
  const externalIds = (row?.["external_ids"] as Record<string, unknown> | null) ?? {};
  const fmp = (externalIds["fmp"] as Record<string, unknown> | null) ?? {};

  return {
    name: (typeof row?.["name"] === "string" && row["name"] !== "") ? (row["name"] as string) : ticker,
    exchange: (typeof row?.["exchange"] === "string") ? (row["exchange"] as string) : null,
    currency: (typeof row?.["currency"] === "string") ? (row["currency"] as string) : "USD",
    cik: (typeof fmp["cik"] === "string") ? (fmp["cik"] as string) : "",
    sector: (typeof row?.["sector"] === "string") ? (row["sector"] as string) : null,
    industry: (typeof row?.["industry"] === "string") ? (row["industry"] as string) : null,
    description: (typeof row?.["business_summary"] === "string") ? (row["business_summary"] as string) : null,
    website: (typeof row?.["website_url"] === "string") ? (row["website_url"] as string) : null,
    country: (typeof row?.["country"] === "string") ? (row["country"] as string) : "US",
    logoUrl: (typeof row?.["logo_url"] === "string") ? (row["logo_url"] as string) : null,
    marketCap: fmp["marketCap"] !== null && fmp["marketCap"] !== undefined ? Number(fmp["marketCap"]) : null,
    averageVolume: fmp["averageVolume"] !== null && fmp["averageVolume"] !== undefined ? Number(fmp["averageVolume"]) : null,
  };
}

/**
 * Reads the latest market quote from the most recent candle in asset_price_history.
 * Computes yearHigh/yearLow from all stored candles and moving averages from
 * recent closes. marketCap/averageVolume come from the company row (stored in
 * external_ids during ingestion).
 */
async function readMarketFromDB(
  assetId: string,
  ticker: string,
  company: StockCompany
): Promise<StockMarket> {
  const res = await pool.query(
    `SELECT open, high, low, close, volume, timestamp
     FROM assets.asset_price_history
     WHERE asset_id = $1 AND interval = '1d'
     ORDER BY timestamp DESC`,
    [assetId]
  );

  const rows = res.rows;
  const latest = rows[0];

  if (!latest) {
    // No candles stored yet (e.g., historical price fetch failed/restricted).
    return {
      price: null,
      previousClose: null,
      change: null,
      changePercent: null,
      marketCap: company.marketCap,
      volume: null,
      averageVolume: company.averageVolume,
      dayHigh: null,
      dayLow: null,
      yearHigh: null,
      yearLow: null,
      priceUpdatedAt: null,
      movingAverages: { sma20: null, sma50: null, sma200: null },
    };
  }

  const close = latest?.["close"] !== null ? Number(latest["close"]) : null;
  const open = latest?.["open"] !== null ? Number(latest["open"]) : (close ?? 0);
  const high = latest?.["high"] !== null ? Number(latest["high"]) : (close ?? 0);
  const low = latest?.["low"] !== null ? Number(latest["low"]) : (close ?? 0);
  const previousClose = close;

  let change: number | null = null;
  let changePercent: number | null = null;

  if (close !== null && open !== null && open !== 0) {
    change = close - open;
    changePercent = (change / open) * 100;
  }

  // --- Year high / low from all stored candles ---
  const allHighs = rows
    .map((r) => Number(r["high"]))
    .filter((h) => Number.isFinite(h));
  const allLows = rows
    .map((r) => Number(r["low"]))
    .filter((l) => Number.isFinite(l));
  const yearHigh = allHighs.length > 0 ? Math.max(...allHighs) : null;
  const yearLow = allLows.length > 0 ? Math.min(...allLows) : null;

  // --- Moving averages from recent closes (latest 200, 50, 20) ---
  const closes = rows
    .map((r) => Number(r["close"]))
    .filter((c) => Number.isFinite(c))
    .reverse(); // oldest-first for SMA calculation

  const sma = (period: number): number | null => {
    if (closes.length < period) return null;
    const sum = closes.slice(0, period).reduce((a, b) => a + b, 0);
    return sum / period;
  };

  return {
    price: close,
    previousClose,
    change,
    changePercent,
    marketCap: company.marketCap,
    volume: latest?.["volume"] !== null ? Number(latest["volume"]) : null,
    averageVolume: company.averageVolume,
    dayHigh: high,
    dayLow: low,
    yearHigh,
    yearLow,
    priceUpdatedAt: latest?.["timestamp"] !== null ? new Date(latest["timestamp"]).toISOString() : null,
    movingAverages: { sma20: sma(20), sma50: sma(50), sma200: sma(200) },
  };
}

/**
 * Reads latest 3 quarterly + latest 3 annual financial reports from DB.
 */
async function readFinancialReportsFromDB(assetId: string): Promise<{
  quarterly: StockFinancialReport[];
  annual: StockFinancialReport[];
}> {
  const { rows } = await pool.query(
    `SELECT form, fiscal_year, fiscal_period, period_end, filing_date,
            accession_number, currency, revenue, gross_profit, operating_income,
            net_income, total_assets, total_liabilities, cash_and_cash_equivalents,
            operating_cash_flow, capital_expenditures, free_cash_flow, source_url
     FROM assets.stock_financial_reports
     WHERE asset_id = $1
     ORDER BY fiscal_year DESC, fiscal_period DESC`,
    [assetId]
  );

  const quarterlyRows = rows.filter((r: any) => r.form === '10-Q').slice(0, 3);
  const annualRows = rows.filter((r: any) => r.form === '10-K').slice(0, 3);

  const mapRow = (r: any): StockFinancialReport => ({
    form: r.form,
    fiscalYear: r.fiscal_year !== null ? Number(r.fiscal_year) : null,
    fiscalPeriod: r.fiscal_period,
    periodEnd: r.period_end !== null ? r.period_end.toISOString().split('T')[0] : null,
    filingDate: r.filing_date !== null ? r.filing_date.toISOString().split('T')[0] : null,
    accessionNumber: r.accession_number,
    revenue: r.revenue !== null ? Number(r.revenue) : null,
    grossProfit: r.gross_profit !== null ? Number(r.gross_profit) : null,
    operatingIncome: r.operating_income !== null ? Number(r.operating_income) : null,
    netIncome: r.net_income !== null ? Number(r.net_income) : null,
    totalAssets: r.total_assets !== null ? Number(r.total_assets) : null,
    totalLiabilities: r.total_liabilities !== null ? Number(r.total_liabilities) : null,
    cashAndCashEquivalents: r.cash_and_cash_equivalents !== null ? Number(r.cash_and_cash_equivalents) : null,
    operatingCashFlow: r.operating_cash_flow !== null ? Number(r.operating_cash_flow) : null,
    capitalExpenditures: r.capital_expenditures !== null ? Number(r.capital_expenditures) : null,
    freeCashFlow: r.free_cash_flow !== null ? Number(r.free_cash_flow) : null,
    currency: r.currency || "USD",
    sourceUrl: r.source_url || null,
  });

  return {
    quarterly: quarterlyRows.map(mapRow),
    annual: annualRows.map(mapRow),
  };
}

/* ============================================================================
 * DATABASE WRITE HELPERS
 * ============================================================================ */

/**
 * Upserts the canonical asset row and returns its UUID.
 */
async function upsertAsset(
  ticker: string,
  company: StockCompany
): Promise<string> {
  const existing = await pool.query(
    `SELECT id FROM assets.assets WHERE symbol = $1 AND asset_type = 'stock' LIMIT 1`,
    [ticker]
  );

  const externalIds = {
    fmp: {
      symbol: ticker,
      name: company.name,
      exchange: company.exchange,
      cik: company.cik,
      marketCap: company.marketCap,
      averageVolume: company.averageVolume,
    },
  };

  if (existing.rows.length > 0) {
    const id = existing.rows[0]["id"] as string;
    await pool.query(
      `UPDATE assets.assets
       SET external_ids = $2::jsonb,
           website_url = COALESCE($3, website_url),
           logo_url = COALESCE($4, logo_url),
           updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(externalIds), company.website ?? null, company.logoUrl ?? null]
    );
    return id;
  }

  const insertRes = await pool.query(
    `INSERT INTO assets.assets (symbol, name, asset_type, website_url, logo_url, external_ids)
     VALUES ($1, $2, 'stock', $3, $4, $5::jsonb)
     RETURNING id`,
    [ticker, company.name, company.website ?? null, company.logoUrl ?? null, JSON.stringify(externalIds)]
  );

  const row = insertRes.rows[0];
  const id = row?.["id"];
  if (typeof id !== "string") {
    throw new Error(`Stock asset insert for ${ticker} returned no id.`);
  }
  return id;
}

/**
 * Upserts the assets.stocks profile row.
 */
async function upsertStockProfile(
  assetId: string,
  company: StockCompany
): Promise<void> {
  await pool.query(
    `INSERT INTO assets.stocks
       (asset_id, exchange, sector, industry, business_summary, currency, country)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (asset_id) DO UPDATE SET
       exchange = COALESCE(EXCLUDED.exchange, assets.stocks.exchange),
       sector = COALESCE(EXCLUDED.sector, assets.stocks.sector),
       industry = COALESCE(EXCLUDED.industry, assets.stocks.industry),
       business_summary = COALESCE(EXCLUDED.business_summary, assets.stocks.business_summary),
       currency = COALESCE(EXCLUDED.currency, assets.stocks.currency),
       country = COALESCE(EXCLUDED.country, assets.stocks.country),
       updated_at = NOW()`,
    [assetId, company.exchange, company.sector, company.industry, company.description, company.currency, company.country]
  );
}

/**
 * Upserts financial statements JSONB + metrics JSONB into assets.stocks.
 */
async function upsertFinancialStatements(
  assetId: string,
  financialReports: { quarterly: StockFinancialReport[]; annual: StockFinancialReport[] }
): Promise<void> {
  const statements = {
    annual: financialReports.annual.map((r) => ({
      fy: r.fiscalYear,
      period: r.fiscalPeriod as "FY",
      concepts: {
        RevenueFromContractWithCustomerExcludingAssessedTax: { concept: "RevenueFromContractWithCustomerExcludingAssessedTax", value: r.revenue, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        Revenues: { concept: "Revenues", value: r.revenue, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        GrossProfit: { concept: "GrossProfit", value: r.grossProfit, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        OperatingIncomeLoss: { concept: "OperatingIncomeLoss", value: r.operatingIncome, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        NetIncomeLoss: { concept: "NetIncomeLoss", value: r.netIncome, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        Assets: { concept: "Assets", value: r.totalAssets, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        Liabilities: { concept: "Liabilities", value: r.totalLiabilities, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        CashAndCashEquivalentsAtCarryingValue: { concept: "CashAndCashEquivalentsAtCarryingValue", value: r.cashAndCashEquivalents, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        NetCashProvidedByUsedInOperatingActivities: { concept: "NetCashProvidedByUsedInOperatingActivities", value: r.operatingCashFlow, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        PaymentsToAcquirePropertyPlantAndEquipment: { concept: "PaymentsToAcquirePropertyPlantAndEquipment", value: r.capitalExpenditures, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
      },
    })),
    quarterly: financialReports.quarterly.map((r) => ({
      fy: r.fiscalYear,
      period: r.fiscalPeriod as "Q1" | "Q2" | "Q3" | "Q4",
      concepts: {
        RevenueFromContractWithCustomerExcludingAssessedTax: { concept: "RevenueFromContractWithCustomerExcludingAssessedTax", value: r.revenue, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        Revenues: { concept: "Revenues", value: r.revenue, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        GrossProfit: { concept: "GrossProfit", value: r.grossProfit, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        OperatingIncomeLoss: { concept: "OperatingIncomeLoss", value: r.operatingIncome, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        NetIncomeLoss: { concept: "NetIncomeLoss", value: r.netIncome, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        Assets: { concept: "Assets", value: r.totalAssets, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        Liabilities: { concept: "Liabilities", value: r.totalLiabilities, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        CashAndCashEquivalentsAtCarryingValue: { concept: "CashAndCashEquivalentsAtCarryingValue", value: r.cashAndCashEquivalents, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        NetCashProvidedByUsedInOperatingActivities: { concept: "NetCashProvidedByUsedInOperatingActivities", value: r.operatingCashFlow, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
        PaymentsToAcquirePropertyPlantAndEquipment: { concept: "PaymentsToAcquirePropertyPlantAndEquipment", value: r.capitalExpenditures, unit: "USD", periodEnd: r.periodEnd ?? "", filingDate: r.filingDate ?? "", accessionNumber: r.accessionNumber ?? "", form: r.form },
      },
    })),
    source: "sec_companyfacts",
    cik: "",
    entityName: "",
    normalizedAt: new Date().toISOString(),
  };

  await pool.query(
    `UPDATE assets.stocks
     SET financial_statements = $2::jsonb,
         updated_at = NOW()
     WHERE asset_id = $1`,
    [assetId, JSON.stringify(statements)]
  );
}

/**
 * Upserts individual financial reports into assets.stock_financial_reports.
 */
async function upsertFinancialReports(
  assetId: string,
  financialReports: { quarterly: StockFinancialReport[]; annual: StockFinancialReport[] }
): Promise<void> {
  const allReports = [
    ...financialReports.annual.map((r) => ({ ...r, form: "10-K" as const, fiscalPeriod: "FY" })),
    ...financialReports.quarterly.map((r) => ({ ...r, form: "10-Q" as const })),
  ];

  for (const r of allReports) {
    // Check for existing row by natural key
    let existingId: string | null = null;
    if (r.accessionNumber) {
      const existing = await pool.query(
        `SELECT id FROM assets.stock_financial_reports WHERE asset_id = $1 AND accession_number = $2`,
        [assetId, r.accessionNumber]
      );
      existingId = existing.rows[0]?.["id"] as string | null ?? null;
    } else {
      const existing = await pool.query(
        `SELECT id FROM assets.stock_financial_reports
         WHERE asset_id = $1 AND form = $2 AND fiscal_year = $3 AND fiscal_period = $4 AND period_end = $5`,
        [assetId, r.form, r.fiscalYear, r.fiscalPeriod, r.periodEnd]
      );
      existingId = existing.rows[0]?.["id"] as string | null ?? null;
    }

    const values = [
      assetId,
      r.form,
      r.fiscalYear,
      r.fiscalPeriod,
      r.periodEnd ?? null,    // period_start
      r.periodEnd ?? null,    // period_end
      r.filingDate ?? null,   // filing_date
      r.accessionNumber ?? null, // accession_number
      r.currency,
      r.revenue,
      r.grossProfit,
      r.operatingIncome,
      r.netIncome,
      r.totalAssets,
      r.totalLiabilities,
      r.cashAndCashEquivalents,
      r.operatingCashFlow,
      r.capitalExpenditures,
      r.freeCashFlow,
      "sec_companyfacts",
      r.sourceUrl,
      JSON.stringify({}),
    ];

    if (existingId) {
      await pool.query(
        `UPDATE assets.stock_financial_reports
         SET form = $2, fiscal_year = $3, fiscal_period = $4, period_start = $5,
             period_end = $6, filing_date = $7, accession_number = $8,
             currency = $9, revenue = $10, gross_profit = $11,
             operating_income = $12, net_income = $13, total_assets = $14,
             total_liabilities = $15, cash_and_cash_equivalents = $16,
             operating_cash_flow = $17, capital_expenditures = $18,
             free_cash_flow = $19, source = $20, source_url = $21,
             report_data = $22::jsonb, updated_at = NOW()
         WHERE id = $1`,
        [existingId, ...values.slice(1)]
      );
    } else {
      await pool.query(
        `INSERT INTO assets.stock_financial_reports
           (asset_id, form, fiscal_year, fiscal_period, period_start, period_end, filing_date,
            accession_number, currency, revenue, gross_profit, operating_income, net_income,
            total_assets, total_liabilities, cash_and_cash_equivalents, operating_cash_flow,
            capital_expenditures, free_cash_flow, source, source_url, report_data)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb)`,
        values
      );
    }
  }
}

/**
 * Upserts daily candles into assets.asset_price_history.
 */
async function upsertCandles(assetId: string, history: StockHistory | null): Promise<void> {
  if (!history || history.candles.length === 0) {
    return;
  }

  const batchSize = 200;
  for (let offset = 0; offset < history.candles.length; offset += batchSize) {
    const batch = history.candles.slice(offset, offset + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (const candle of batch) {
      const base = values.length;
      placeholders.push(
        `($${base + 1}, $${base + 2}::timestamptz, '1d', $${base + 3}::numeric, ` +
          `$${base + 4}::numeric, $${base + 5}::numeric, $${base + 6}::numeric, ` +
          `$${base + 7}::numeric, $${base + 8}, $${base + 9})`
      );
      values.push(
        assetId,
        candle.timestamp,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume ?? null,
        null,
        null
      );
    }

    await pool.query(
      `INSERT INTO assets.asset_price_history
         (asset_id, "timestamp", interval, open, high, low, close, volume, quote_currency, volume_unit)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (asset_id, interval, "timestamp") DO UPDATE SET
         open = EXCLUDED.open,
         high = EXCLUDED.high,
         low = EXCLUDED.low,
         close = EXCLUDED.close,
         volume = EXCLUDED.volume,
         quote_currency = COALESCE(EXCLUDED.quote_currency, assets.asset_price_history.quote_currency),
         volume_unit = COALESCE(EXCLUDED.volume_unit, assets.asset_price_history.volume_unit)`,
      values
    );
  }
}

/* ============================================================================
 * MIDDLEWARE: Request Logging
 * ============================================================================ */

function requestLogger(req: Request, res: Response, next: () => void) {
  const startTime = Date.now();
  console.log(`[STOCK_ROUTES] ${req.method} ${req.path} - Params:`, req.params, "Query:", req.query);

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(`[STOCK_ROUTES] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
}

router.use(requestLogger);

/* ============================================================================
 * ROUTE: GET /api-v1/stocks/:ticker
 * ============================================================================ */

/**
 * GET /api-v1/stocks/:ticker
 *
 * Logic:
 * 1. Get ticker from path parameter
 * 2. Check if database has current data for this ticker
 * 3. If current -> return data from database
 * 4. If not current or no data -> fetch via stockNormalizer, inject into DB,
 *    then return data from database
 * 5. If ticker is not legitimate -> return error
 *
 * Output file: collectors/assets/data/stocks_intelligence_<TICKER>_<timestamp>.json
 */
router.get("/:ticker", async (req: Request, res: Response) => {
  const routeContext = "GET /:ticker";

  try {
    const { ticker } = req.params;

    // Validate ticker parameter
    if (!ticker || typeof ticker !== "string" || ticker.trim().length === 0) {
      console.warn(`[STOCK_ROUTES] ${routeContext} - Missing or invalid ticker`);
      return res.status(400).json({
        error: "validation_failed",
        message: "Ticker parameter is required"
      });
    }

    const cleanTicker = ticker.trim().toUpperCase();
    console.log(`[STOCK_ROUTES] ${routeContext} - Clean ticker:`, cleanTicker);

    // Parse query parameters
    const refresh = req.query.refresh === "true";
    console.log(`[STOCK_ROUTES] ${routeContext} - Options:`, { refresh });

    // Check DB freshness
    const freshness = await checkDbFreshness(cleanTicker);

    // If data is current and not forced refresh, return from DB
    if (freshness.exists && freshness.fresh && !refresh) {
      console.log(`[STOCK_ROUTES] ${routeContext} - DB data is current, returning from DB`);
      const simpleResponse = await buildSimpleResponseFromDB(freshness.assetId!, cleanTicker);
      await writeResponseToFile("stocks_intelligence", cleanTicker, simpleResponse);
      return res.status(200).json(simpleResponse);
    }

    // Fetch from providers via stockNormalizer
    console.log(`[STOCK_ROUTES] ${routeContext} - Fetching from providers via stockNormalizer`);
    const raw = await fetchStockIntelligence(cleanTicker);

    // Validate that we got legitimate data (profile or quote)
    if ((!raw.profile || raw.profile.length === 0) && (!raw.quote || raw.quote.length === 0)) {
      console.warn(`[STOCK_ROUTES] ${routeContext} - No data returned for ticker: ${cleanTicker}`);
      return res.status(404).json({
        error: "wrong_ticker",
        message: `This is not a recognized stock: ${cleanTicker}`
      });
    }

    // Normalize into the target output shape
    const normalized = normalizeStockIntelligence(raw, cleanTicker);

    // Inject into SQL database
    const assetId = await upsertAsset(cleanTicker, normalized.company);
    await upsertStockProfile(assetId, normalized.company);
    await upsertFinancialStatements(assetId, normalized.financialReports);
    await upsertFinancialReports(assetId, normalized.financialReports);
    await upsertCandles(assetId, normalized.history);

    console.log(`[STOCK_ROUTES] ${routeContext} - Data injected into database for asset ${assetId}`);

    // Build response from DB (always return from DB)
    const simpleResponse = await buildSimpleResponseFromDB(assetId, cleanTicker);

    // Log concise result summary
    console.log(`[STOCK_ROUTES] ${routeContext} - Result:`, {
      ticker: simpleResponse.ticker,
      company: simpleResponse.company.name,
      hasQuote: simpleResponse.market.price !== null,
      quarterlyCount: simpleResponse.financialReports.quarterly.length,
      annualCount: simpleResponse.financialReports.annual.length,
      dataUpdatedAt: simpleResponse.dataUpdatedAt,
    });

    // Write response to file
    await writeResponseToFile("stocks_intelligence", cleanTicker, simpleResponse);

    // Return simplified response
    return res.status(200).json(simpleResponse);

  } catch (error) {
    const { response, statusCode } = createErrorResponse(error, routeContext, 500);
    res.status(statusCode).json(response);
  }
});

/**
 * Builds the simplified response contract by reading from the database.
 */
async function buildSimpleResponseFromDB(
  assetId: string,
  ticker: string
): Promise<{
  ticker: string;
  company: StockCompany;
  market: StockMarket;
  history: StockHistory | null;
  financialReports: { quarterly: StockFinancialReport[]; annual: StockFinancialReport[] };
  dataUpdatedAt: string | null;
}> {
  const company = await readCompanyFromDB(assetId, ticker);
  const [market, financialReports] = await Promise.all([
    readMarketFromDB(assetId, ticker, company),
    readFinancialReportsFromDB(assetId),
  ]);

  const timestamps: string[] = [
    market.priceUpdatedAt,
    ...financialReports.quarterly.map((r) => r.filingDate).filter(Boolean),
    ...financialReports.annual.map((r) => r.filingDate).filter(Boolean),
  ].filter((t): t is string => t !== null);

  const dataUpdatedAt = timestamps.length > 0
    ? timestamps.reduce((latest, current) => (current > latest ? current : latest))
    : null;

  return {
    ticker,
    company,
    market,
    history: null,
    financialReports,
    dataUpdatedAt,
  };
}

/* ============================================================================
 * EXPORTS
 * ============================================================================ */

export default router;
