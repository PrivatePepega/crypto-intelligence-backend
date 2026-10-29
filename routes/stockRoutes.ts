/**
 * Stock Routes - Single GET /:ticker endpoint
 *
 * This route provides deterministic stock intelligence ingestion and retrieval.
 * Flow:
 * 1. GET /api-v1/stocks/:ticker - takes a stock symbol (e.g., MSFT)
 * 2. Checks database for existing asset and data freshness
 * 3. Fetches missing/stale data from providers (FMP, SEC)
 * 4. Persists all data to PostgreSQL
 * 5. Returns simplified intelligence package from database
 */

import { Router } from "express";
import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { getOrIngestStock } from "../services/stocks/stockIntelligenceService.js";
import { mapToSimpleResponse } from "../services/stocks/simpleResponseMapper.js";

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

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================ */

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
 * - Returns simplified intelligence package from database
 *
 * Path Parameters:
 * - ticker: Stock ticker symbol (e.g., MSFT, AAPL, GOOGL)
 *
 * Query Parameters:
 * - refresh: "true" | "false" (default: false) - force refresh even if data appears fresh
 * - readOnly: "true" | "false" (default: false) - skip ingestion, only read from DB
 *
 * Response: Simplified contract:
 * - ticker: string
 * - company: { name, exchange, currency, cik, sector, industry, description, website, country, logoUrl }
 * - market: { price, change, changePercent, marketCap, volume, averageVolume, dayHigh, dayLow, yearHigh, yearLow, priceUpdatedAt }
 * - financialReports: { latestQuarterly (10-Q), latestAnnual (10-K) }
 * - dataUpdatedAt: string | null
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
    const readOnly = req.query.readOnly === "true";

    console.log(`[STOCK_ROUTES] ${routeContext} - Options:`, { refresh, readOnly });

    // Build options for getOrIngestStock
    const options = { refresh, readOnly };

    console.log(`[STOCK_ROUTES] ${routeContext} - Calling getOrIngestStock()`);
    const startTime = Date.now();
    const serviceResult = await getOrIngestStock(cleanTicker, options);
    const duration = Date.now() - startTime;
    console.log(`[STOCK_ROUTES] ${routeContext} - getOrIngestStock completed in ${duration}ms`);

    // Map to simplified response contract
    const simpleResponse = mapToSimpleResponse(serviceResult);

    // Log concise result summary
    console.log(`[STOCK_ROUTES] ${routeContext} - Result:`, {
      ticker: simpleResponse.ticker,
      company: simpleResponse.company.name,
      hasQuote: simpleResponse.market.price !== null,
      quarterly: simpleResponse.financialReports.latestQuarterly.fiscalYear ?? "none",
      annual: simpleResponse.financialReports.latestAnnual.fiscalYear ?? "none",
      dataUpdatedAt: simpleResponse.dataUpdatedAt,
    });

    // Write response to file
    await writeResponseToFile("stocks_intelligence", cleanTicker, simpleResponse);

    // Return simplified response (always 200 with the contract shape)
    return res.status(200).json(simpleResponse);

  } catch (error) {
    const { response, statusCode } = createErrorResponse(error, routeContext, 500);
    res.status(statusCode).json(response);
  }
});

/* ============================================================================
 * EXPORTS
 * ============================================================================ */

export default router;