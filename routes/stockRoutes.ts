/**
 * Stock Routes - Single GET /:ticker endpoint with comprehensive instrumentation
 *
 * This route provides deterministic stock intelligence ingestion and retrieval.
 * Flow:
 * 1. GET /api-v1/stocks/:ticker - takes a stock symbol (e.g., MSFT)
 * 2. Checks database for existing asset and data freshness
 * 3. Fetches missing/stale data from providers (FMP, SEC)
 * 4. Persists all data to PostgreSQL
 * 5. Returns complete intelligence package from database
 *
 * All requests and responses are logged to console and saved to collectors/assets/data/
 * for debugging and verification.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { getOrIngestStock } from "../services/stocks/stockIntelligenceService.js";
import type { StockIntelligenceResult } from "../types/stocks/stock.types.js";

const router = Router();

/* ============================================================================
 * CONSTANTS & CONFIGURATION
 * ============================================================================ */

const DATA_OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/data");

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================ */

/**
 * Ensures the output directory exists
 */
async function ensureOutputDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error("[STOCK_ROUTES] Failed to create output directory:", error);
  }
}

/**
 * Writes JSON response to collectors/assets/data/ with timestamp
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

  if (message.includes("not a recognized stock") || message.includes("is an ETF/fund")) {
    errorCode = "stock_not_found";
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
 * Single endpoint for stock intelligence:
 * - Takes a stock symbol (ticker) as path parameter
 * - Checks database for existing data and freshness
 * - Fetches missing/stale data from FMP and SEC
 * - Persists all data to PostgreSQL
 * - Returns complete intelligence package from database
 *
 * Path Parameters:
 * - ticker: Stock ticker symbol (e.g., MSFT, AAPL, GOOGL)
 *
 * Query Parameters:
 * - refresh: "true" | "false" (default: false) - force refresh even if data appears fresh
 * - readOnly: "true" | "false" (default: false) - skip ingestion, only read from DB
 *
 * Response: Full StockIntelligenceResult object containing:
 * - identity: canonical stock identity
 * - profile: company profile (exchange, sector, description, etc.)
 * - quote: current market quote/snapshot
 * - history: daily OHLCV candles (last 30 by default)
 * - financialStatements: SEC financial statements (annual/quarterly)
 * - financialMetrics: computed financial ratios
 * - insiderTransactions: SEC Form 4 insider trades
 * - institutionalHoldings: 13F institutional holdings
 * - beneficialOwnership: 13D/G beneficial ownership filings
 * - corporateActions: corporate action events from SEC filings
 * - coverage: freshness report for each dataset
 * - errors: any ingestion errors
 */
router.get("/:ticker", async (req: Request, res: Response) => {
  const routeContext = "GET /:ticker";
  console.log(`[STOCK_ROUTES] ${routeContext} - Starting request`);
  console.log(`[STOCK_ROUTES] ${routeContext} - Params:`, req.params, "Query:", req.query);

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
    const readOnly = req.query.readOnly === "true";

    console.log(`[STOCK_ROUTES] ${routeContext} - Options:`, { refresh, readOnly });

    // Build options for getOrIngestStock
    const options = {
      refresh,
      readOnly,
      include: undefined as undefined // include all datasets by default
    };

    console.log(`[STOCK_ROUTES] ${routeContext} - Calling getOrIngestStock()`);
    const startTime = Date.now();
    const result = await getOrIngestStock(cleanTicker, options);
    const duration = Date.now() - startTime;
    console.log(`[STOCK_ROUTES] ${routeContext} - getOrIngestStock completed in ${duration}ms`);

    // Log result summary
    console.log(`[STOCK_ROUTES] ${routeContext} - Result summary:`, {
      hasIdentity: !!result.identity,
      hasProfile: !!result.profile,
      hasQuote: !!result.quote,
      hasHistory: !!result.history,
      historyCandles: result.history?.candles?.length || 0,
      hasFinancialStatements: !!result.financialStatements,
      hasFinancialMetrics: !!result.financialMetrics,
      insiderCount: result.insiderTransactions?.length || 0,
      institutionalCount: result.institutionalHoldings?.length || 0,
      beneficialCount: result.beneficialOwnership?.length || 0,
      corporateCount: result.corporateActions?.length || 0,
      errors: result.errors.length,
      coverageFresh: result.coverage?.overallFresh
    });

    // Determine HTTP status based on errors
    if (result.errors.length > 0) {
      const failedCount = result.errors.length;
      console.log(`[STOCK_ROUTES] ${routeContext} - Partial/Complete failure: ${failedCount} datasets failed`);

      if (failedCount > 0 && !result.profile && !result.quote && !result.history) {
        // Complete failure - no core data
        const errorResponse = {
          error: "ingestion_failed",
          message: "All dataset collections failed",
          details: result.errors,
          ...result
        };
        await writeResponseToFile("stocks_intelligence_error", cleanTicker, errorResponse);
        return res.status(502).json(errorResponse);
      }

      // Partial failure - return 200 with warnings
      const partialResponse = {
        ...result,
        warnings: result.errors.map(e => `${e.dataset}: ${e.message}`)
      };
      await writeResponseToFile("stocks_intelligence_partial", cleanTicker, partialResponse);
      return res.status(200).json(partialResponse);
    }

    // Complete success
    await writeResponseToFile("stocks_intelligence", cleanTicker, result);
    console.log(`[STOCK_ROUTES] ${routeContext} - Complete success`);
    res.json(result);

  } catch (error) {
    const { response, statusCode } = createErrorResponse(error, routeContext, 500);
    const tickerStr = Array.isArray(req.params.ticker) ? req.params.ticker[0] : req.params.ticker;
    await writeResponseToFile("stocks_intelligence_exception", tickerStr || "unknown", response);
    res.status(statusCode).json(response);
  }
});

/* ============================================================================
 * EXPORTS
 * ============================================================================ */

export default router;

/* ============================================================================
 * USAGE NOTES FOR FUTURE AGENTS
 * ============================================================================
 *
 * 1. DATA PERSISTENCE:
 *    All responses are automatically saved to collectors/assets/data/ with timestamps.
 *    Files are named: {prefix}_{ticker}_{timestamp}.json
 *    - stocks_intelligence_{ticker}_{timestamp}.json (success)
 *    - stocks_intelligence_partial_{ticker}_{timestamp}.json (partial failure)
 *    - stocks_intelligence_error_{ticker}_{timestamp}.json (complete failure)
 *    - stocks_intelligence_exception_{ticker}_{timestamp}.json (unhandled exception)
 *
 * 2. DEBUGGING:
 *    - All requests log to console with [STOCK_ROUTES] prefix
 *    - Check console for detailed step-by-step execution logs
 *    - Check collectors/assets/data/ for actual response payloads
 *
 * 3. ERROR HANDLING:
 *    - Validation errors: 400 with "validation_failed"
 *    - Not found: 404 with "stock_not_found"
 *    - Ambiguous: 409 with "ambiguous_stock"
 *    - Complete ingestion failure: 502 with "ingestion_failed"
 *    - Partial failure: 200 with warnings array
 *    - Server errors: 500 with "intelligence_failed"
 *
 * 4. TESTING:
 *    curl "http://localhost:5000/api-v1/stocks/MSFT"
 *    curl "http://localhost:5000/api-v1/stocks/MSFT?refresh=true"
 *    curl "http://localhost:5000/api-v1/stocks/MSFT?readOnly=true"
 *
 * 5. DEPENDENCIES:
 *    - services/stocks/stockIntelligenceService.ts (getOrIngestStock)
 *    - types/stocks/stock.types.ts (StockIntelligenceResult, GetOrIngestStockOptions)
 *    - collectors/assets/data/ must be writable
 */