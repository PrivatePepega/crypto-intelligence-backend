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
router.get("/search", async (req, res, next) => {
  console.log("[STOCKS SEARCH] Route matched, path:", req.path, "method:", req.method);
  console.log("[STOCKS SEARCH] Raw query:", req.query);
  
  // Manual validation to bypass middleware issues
  const searchQuerySchema = z.object({
    query: z.string().trim().min(1, "Query is required").max(100),
    limit: z.coerce.number().int().positive().max(50).optional().default(10),
  });

  const validationResult = searchQuerySchema.safeParse(req.query);
  if (!validationResult.success) {
    console.log("[STOCKS SEARCH] Validation failed:", validationResult.error.issues.map(i => i.message));
    return res.status(400).json({
      error: "validation_failed",
      message: validationResult.error.issues.map(i => i.message).join(", "),
    });
  }

  const { query, limit } = validationResult.data;
  console.log("[STOCKS SEARCH] Validated params:", { query, limit });

  try {
    console.log("[STOCKS SEARCH] Calling autocompleteStocks...");
    const results = await autocompleteStocks(query, Number(limit ?? 10));
    console.log("[STOCKS SEARCH] Results:", results.length);
    res.json({
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error("[STOCKS SEARCH] Error:", error);
    console.error("[STOCKS SEARCH] Stack:", error instanceof Error ? error.stack : "No stack");
    res.status(500).json({
      error: "search_failed",
      message: error instanceof Error ? error.message : "Stock search failed",
      stack: error instanceof Error ? error.stack : undefined,
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
  console.log("[STOCKS INTELLIGENCE GET] Request:", req.params, req.query);
  try {
    const { ticker } = req.params;
    const refresh = req.query.refresh === "true";
    const readOnly = req.query.readOnly === "true";
    const includeParam = req.query.include;
    let include: string[] | undefined;
    if (includeParam) {
      const str = Array.isArray(includeParam) ? (includeParam[0] as string) : String(includeParam);
      include = str.split(",").filter(Boolean);
    }

    console.log("[STOCKS INTELLIGENCE GET] Calling getOrIngestStock with:", { ticker, refresh, readOnly, include });
    const options: GetOrIngestStockOptions = { refresh, include: include as DatasetName[] | undefined, readOnly };
    const result = await getOrIngestStock(ticker, options);
    console.log("[STOCKS INTELLIGENCE GET] Success, errors:", result.errors.length);

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
    console.error("[STOCKS INTELLIGENCE GET] Error:", error);
    console.error("[STOCKS INTELLIGENCE GET] Stack:", error instanceof Error ? error.stack : "No stack");
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not a recognized stock") || message.includes("is an ETF/fund")) {
      return res.status(404).json({ error: "stock_not_found", message });
    }
    if (message.includes("matches multiple")) {
      return res.status(409).json({ error: "ambiguous_stock", message });
    }

    res.status(500).json({ error: "intelligence_failed", message: "Failed to retrieve stock intelligence" });
  }
});

export default router;