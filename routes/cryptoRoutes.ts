import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "../middleware/validateRequest.js";
import { getOrIngestCrypto, autocompleteCrypto } from "../services/crypto/cryptoIntelligenceService.js";
import type { GetOrIngestCryptoOptions, CryptoDatasetName, CryptoCandle } from "../types/crypto/crypto.types.js";

const router = Router();

/* -------------------------------------------------------------------------- */
/*                           Request Schemas                                  */
/* -------------------------------------------------------------------------- */

const searchQuerySchema = z.object({
  query: z.string().trim().min(1, "Query is required").max(100),
  limit: z.coerce.number().int().positive().max(50).optional().default(10),
});

const ingestCryptoSchema = z.object({
  query: z.string().trim().min(1, "Query (token name, symbol, or CoinGecko ID) is required").max(100),
  refresh: z.coerce.boolean().optional().default(false),
  include: z.array(z.enum([
    "profile",
    "market_snapshot",
    "price_history",
    "contract_metadata",
    "contract_analysis",
    "token_supply",
    "security",
    "transfers",
    "balances",
    "holder_distribution",
  ])).optional(),
  readOnly: z.coerce.boolean().optional().default(false),
  network: z.string().trim().max(50).optional(),
  contractAddress: z.string().trim().max(42).optional(),
  historyRange: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1mo"]).optional(),
  }).optional(),
});

/* -------------------------------------------------------------------------- */
/*                           Routes                                           */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/crypto/search?q=BTC&limit=10
 * Autocomplete/search for crypto tokens by name, symbol, or CoinGecko ID.
 * Lightweight - does not trigger full ingestion.
 */
router.get("/search", validateRequest(searchQuerySchema, 'query'), async (req, res) => {
  try {
    const { query, limit } = req.query as { query: string; limit?: string };
    const results = await autocompleteCrypto(query, Number(limit ?? 10));
    res.json({
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error("Crypto search failed:", error);
    res.status(500).json({
      error: "search_failed",
      message: error instanceof Error ? error.message : "Crypto search failed",
    });
  }
});

/**
 * POST /api/crypto/intelligence
 * Resolves a crypto token, checks coverage/freshness, performs required ingestion,
 * and returns the stored intelligence.
 *
 * Body:
 * {
 *   "query": "BTC" | "bitcoin" | "ethereum",
 *   "refresh": false,
 *   "include": ["profile", "market_snapshot", "price_history", ...],
 *   "readOnly": false,
 *   "network": "ethereum",
 *   "contractAddress": "0x...",
 *   "historyRange": { "from": "2024-01-01", "to": "2024-12-31" }
 * }
 */
router.post("/intelligence", validateRequest(ingestCryptoSchema), async (req, res) => {
  try {
    const { query, refresh, include, readOnly, network, contractAddress, historyRange } = req.body as {
      query: string;
      refresh?: boolean;
      include?: CryptoDatasetName[];
      readOnly?: boolean;
      network?: string;
      contractAddress?: string;
      historyRange?: { from: string; to: string; interval?: CryptoCandle["interval"] };
    };

    const options: GetOrIngestCryptoOptions = {
      refresh: refresh ?? false,
      include: include as CryptoDatasetName[] | undefined,
      readOnly: readOnly ?? false,
      ...(network !== undefined ? { network } : {}),
      ...(contractAddress !== undefined ? { contractAddress } : {}),
      ...(historyRange !== undefined ? { historyRange } : {}),
    };

    const result = await getOrIngestCrypto(query, options);

    // Determine HTTP status based on result
    if (result.errors.length > 0) {
      // Partial success - some datasets failed
      const failedCount = result.errors.length;
      const totalDatasets = [
        "profile", "market_snapshot", "price_history", "contract_metadata",
        "contract_analysis", "token_supply", "security", "transfers",
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

    if (message.includes("not found") || message.includes("No token found")) {
      return res.status(404).json({
        error: "crypto_not_found",
        message,
      });
    }

    if (message.includes("matches multiple") || message.includes("ambiguous")) {
      return res.status(409).json({
        error: "ambiguous_crypto",
        message,
      });
    }

    console.error("Crypto intelligence failed:", error);
    res.status(500).json({
      error: "intelligence_failed",
      message: "Failed to retrieve crypto intelligence",
      details: message,
    });
  }
});

/**
 * GET /api/crypto/intelligence/:identifier
 * Convenience GET endpoint for the most common use case.
 * Query params: refresh, include, readOnly, network, contractAddress
 */
router.get("/intelligence/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;
    const refresh = req.query.refresh === "true";
    const readOnly = req.query.readOnly === "true";
    const network = req.query.network as string | undefined;
    const contractAddress = req.query.contractAddress as string | undefined;
    const include = req.query.include
      ? (req.query.include as string).split(",").filter(Boolean)
      : undefined;
    const historyRange = req.query.historyRange
      ? JSON.parse(req.query.historyRange as string)
      : undefined;

    const options: GetOrIngestCryptoOptions = {
      refresh,
      include: include as CryptoDatasetName[] | undefined,
      readOnly,
      ...(network !== undefined ? { network } : {}),
      ...(contractAddress !== undefined ? { contractAddress } : {}),
      ...(historyRange !== undefined ? { historyRange } : {}),
    };

    const result = await getOrIngestCrypto(identifier, options);

    if (result.errors.length > 0) {
      const failedCount = result.errors.length;
      const totalDatasets = 8;
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

    if (message.includes("not found") || message.includes("No token found")) {
      return res.status(404).json({ error: "crypto_not_found", message });
    }
    if (message.includes("matches multiple") || message.includes("ambiguous")) {
      return res.status(409).json({ error: "ambiguous_crypto", message });
    }

    console.error("Crypto intelligence failed:", error);
    res.status(500).json({ error: "intelligence_failed", message: "Failed to retrieve crypto intelligence" });
  }
});

export default router;