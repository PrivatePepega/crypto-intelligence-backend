import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "../middleware/validateRequest.js";
import { getOrIngestStock, autocompleteStocks } from "../services/stocks/stockIntelligenceService.js";
import type { GetOrIngestStockOptions, DatasetName } from "../types/stocks/stock.types.js";

const router = Router();

/* -------------------------------------------------------------------------- */
/*                           Request Schemas                                  */
/* -------------------------------------------------------------------------- */

const searchQuerySchema = z.object({
  query: z.string().trim().min(1, "Query is required").max(100),
  limit: z.coerce.number().int().positive().max(50).optional().default(10),
});

const ingestStockSchema = z.object({
  query: z.string().trim().min(1, "Query (ticker or company name) is required").max(100),
  refresh: z.coerce.boolean().optional().default(false),
  include: z.array(z.enum([
    "profile",
    "quote",
    "history",
    "financial_statements",
    "financial_metrics",
    "insider_transactions",
    "institutional_holdings",
    "beneficial_ownership",
    "corporate_actions",
  ])).optional(),
  readOnly: z.coerce.boolean().optional().default(false),
});

/* -------------------------------------------------------------------------- */
/*                           Routes                                           */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/stocks/search?q=AAPL&limit=10
 * Autocomplete/search for stocks by ticker or company name.
 * Lightweight - does not trigger full ingestion.
 */
router.get("/search", validateRequest(searchQuerySchema), async (req, res) => {
  try {
    const { query, limit } = req.query as { query: string; limit?: string };
    const results = await autocompleteStocks(query, Number(limit ?? 10));
    res.json({
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error("Stock search failed:", error);
    res.status(500).json({
      error: "search_failed",
      message: error instanceof Error ? error.message : "Stock search failed",
    });
  }
});

/**
 * POST /api/stocks/intelligence
 * Resolves a stock, checks coverage/freshness, performs required ingestion,
 * and returns the stored intelligence.
 *
 * Body:
 * {
 *   "query": "AAPL" | "Apple Inc.",
 *   "refresh": false,
 *   "include": ["profile", "quote", "history", ...],
 *   "readOnly": false
 * }
 */
router.post("/intelligence", validateRequest(ingestStockSchema), async (req, res) => {
  try {
    const { query, refresh, include, readOnly } = req.body as {
      query: string;
      refresh?: boolean;
      include?: GetOrIngestStockOptions["include"];
      readOnly?: boolean;
    };

    const options: GetOrIngestStockOptions = {
      refresh,
      include: include as DatasetName[] | undefined,
      readOnly,
    };

    const result = await getOrIngestStock(query, options);

    // Determine HTTP status based on result
    if (result.errors.length > 0) {
      // Partial success - some datasets failed
      const failedCount = result.errors.length;
      const totalDatasets = [
        "profile", "quote", "history", "financial_statements", "financial_metrics",
        "insider_transactions", "institutional_holdings", "beneficial_ownership", "corporate_actions"
      ].length;

      if (failedCount === totalDatasets) {
        // Complete failure
        return res.status(502).json({
          error: "ingestion_failed",
          message: "All dataset collections failed",
          details: result.errors,
        });
      }

      // Partial failure - return 200 with error details
      return res.status(200).json({
        ...result,
        warnings: result.errors.map((e: any) => `${e.dataset}: ${e.message}`),
      });
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not a recognized stock") || message.includes("is an ETF/fund")) {
      return res.status(404).json({
        error: "stock_not_found",
        message,
      });
    }

    if (message.includes("matches multiple")) {
      return res.status(409).json({
        error: "ambiguous_stock",
        message,
      });
    }

    console.error("Stock intelligence failed:", error);
    res.status(500).json({
      error: "intelligence_failed",
      message: "Failed to retrieve stock intelligence",
      details: message,
    });
  }
});

/**
 * GET /api/stocks/intelligence/:ticker
 * Convenience GET endpoint for the most common use case.
 * Query params: refresh, include, readOnly
 */
router.get("/intelligence/:ticker", async (req, res) => {
  try {
    const { ticker } = req.params;
    const refresh = req.query.refresh === "true";
    const readOnly = req.query.readOnly === "true";
    const include = req.query.include
      ? (req.query.include as string).split(",").filter(Boolean)
      : undefined;

    const options: GetOrIngestStockOptions = { refresh, include: include as DatasetName[] | undefined, readOnly };
    const result = await getOrIngestStock(ticker, options);

    if (result.errors.length > 0) {
      const failedCount = result.errors.length;
      const totalDatasets = 9;
      if (failedCount === totalDatasets) {
        return res.status(502).json({
          error: "ingestion_failed",
          message: "All dataset collections failed",
          details: result.errors,
        });
      }
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not a recognized stock") || message.includes("is an ETF/fund")) {
      return res.status(404).json({ error: "stock_not_found", message });
    }
    if (message.includes("matches multiple")) {
      return res.status(409).json({ error: "ambiguous_stock", message });
    }

    console.error("Stock intelligence failed:", error);
    res.status(500).json({ error: "intelligence_failed", message: "Failed to retrieve stock intelligence" });
  }
});

export default router;