import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "../middleware/validateRequest.js";
import { getOrIngestCommodity, autocompleteCommodities } from "../services/commodities/commodityIntelligenceService.js";
import type { GetOrIngestCommodityOptions, CommodityDatasetName } from "../types/commodities/commodity.types.js";

type CommodityOptionsInput = {
  query: string;
  refresh?: boolean;
  include?: CommodityDatasetName[];
  readOnly?: boolean;
  historyRange?: { from: string; to: string };
};

const router = Router();

/* -------------------------------------------------------------------------- */
/*                           Request Schemas                                  */
/* -------------------------------------------------------------------------- */

const searchQuerySchema = z.object({
  query: z.string().trim().min(1, "Query is required").max(100),
  limit: z.coerce.number().int().positive().max(50).optional().default(10),
});

const ingestCommoditySchema = z.object({
  query: z.string().trim().min(1, "Query (commodity symbol or name) is required").max(100),
  refresh: z.coerce.boolean().optional().default(false),
  include: z.array(z.enum([
    "profile",
    "market_snapshot",
    "price_history",
    "fundamentals",
  ])).optional(),
  readOnly: z.coerce.boolean().optional().default(false),
  historyRange: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).optional(),
});

/* -------------------------------------------------------------------------- */
/*                           Routes                                           */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/commodities/search?q=GOLD&limit=10
 * Autocomplete/search for commodities by symbol or name.
 * Lightweight - does not trigger full ingestion.
 */
router.get("/search", validateRequest(searchQuerySchema), async (req, res) => {
  try {
    const { query, limit } = req.query as { query: string; limit?: string };
    const results = await autocompleteCommodities(query, Number(limit ?? 10));
    res.json({
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error("Commodity search failed:", error);
    res.status(500).json({
      error: "search_failed",
      message: error instanceof Error ? error.message : "Commodity search failed",
    });
  }
});

/**
 * POST /api/commodities/intelligence
 * Resolves a commodity, checks coverage/freshness, performs required ingestion,
 * and returns the stored intelligence.
 *
 * Body:
 * {
 *   "query": "GCUSD" | "Gold" | "WTI",
 *   "refresh": false,
 *   "include": ["profile", "market_snapshot", "price_history"],
 *   "readOnly": false,
 *   "historyRange": { "from": "2024-01-01", "to": "2024-12-31" }
 * }
 */
router.post("/intelligence", validateRequest(ingestCommoditySchema), async (req, res) => {
  try {
    const { query, refresh, include, readOnly, historyRange } = req.body as CommodityOptionsInput;

    const options: GetOrIngestCommodityOptions = {
      refresh: refresh ?? false,
      include: include as CommodityDatasetName[] | undefined,
      readOnly: readOnly ?? false,
      ...(historyRange !== undefined ? { historyRange } : {}),
    };

    const result = await getOrIngestCommodity(query, options);

    // Determine HTTP status based on result
    if (result.errors.length > 0) {
      // Partial success - some datasets failed
      const failedCount = result.errors.length;
      const totalDatasets = [
        "profile", "market_snapshot", "price_history", "fundamentals",
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
        warnings: result.errors.map((e) => `${e.dataset}: ${e.message}`),
      });
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not found") || message.includes("No commodity found")) {
      return res.status(404).json({
        error: "commodity_not_found",
        message,
      });
    }

    if (message.includes("matches multiple") || message.includes("ambiguous")) {
      return res.status(409).json({
        error: "ambiguous_commodity",
        message,
      });
    }

    console.error("Commodity intelligence failed:", error);
    res.status(500).json({
      error: "intelligence_failed",
      message: "Failed to retrieve commodity intelligence",
      details: message,
    });
  }
});

/**
 * GET /api/commodities/intelligence/:identifier
 * Convenience GET endpoint for the most common use case.
 * Query params: refresh, include, readOnly, historyRange
 */
router.get("/intelligence/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;
    const refresh = req.query.refresh === "true";
    const readOnly = req.query.readOnly === "true";
    const include = req.query.include
      ? (req.query.include as string).split(",").filter(Boolean)
      : undefined;
    const historyRange = req.query.historyRange
      ? JSON.parse(req.query.historyRange as string)
      : undefined;

    const options: GetOrIngestCommodityOptions = {
      refresh,
      include: include as CommodityDatasetName[] | undefined,
      readOnly,
      ...(historyRange !== undefined ? { historyRange } : {}),
    };

    const result = await getOrIngestCommodity(identifier, options);

    if (result.errors.length > 0) {
      const failedCount = result.errors.length;
      const totalDatasets = 4;
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

    if (message.includes("not found") || message.includes("No commodity found")) {
      return res.status(404).json({ error: "commodity_not_found", message });
    }
    if (message.includes("matches multiple") || message.includes("ambiguous")) {
      return res.status(409).json({ error: "ambiguous_commodity", message });
    }

    console.error("Commodity intelligence failed:", error);
    res.status(500).json({ error: "intelligence_failed", message: "Failed to retrieve commodity intelligence" });
  }
});

export default router;