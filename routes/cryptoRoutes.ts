/**
 * Crypto Routes - Single GET /:ticker endpoint
 *
 * Deterministic crypto intelligence flow:
 * 1. GET /api-v1/crypto/:ticker - takes a crypto symbol (e.g., BTC)
 * 2. Checks database for existing data and freshness
 * 3. If data is current -> returns it from the database
 * 4. If stale or missing -> fetches from providers via cryptoNormalizer,
 *    injects into the SQL database (assets.assets, assets.crypto),
 *    then returns data from the database
 * 5. If ticker is not legitimate -> returns an error
 *
 * Output file: collectors/assets/data/crypto_intelligence_<TICKER>_<timestamp>.json
 * All output data is read from the database tables in database/sql/assets/.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import pool from "../config/database.js";
import {
  fetchCryptoIntelligence,
  normalizeCryptoIntelligence,
  type CryptoIntelligenceData,
  type CryptoAsset,
  type CryptoMarket,
  type CryptoSupply,
  type CryptoNetwork,
} from "../collectors/assets/crypto/cryptoNormalizer.js";

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
    console.error("[CRYPTO_ROUTES] Failed to create output directory:", error);
  });
}

/**
 * Writes JSON response to collectors/assets/data/ with timestamp.
 * Output structure: crypto_intelligence_<TICKER>_<ISO-timestamp>.json
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
    console.log(`[CRYPTO_ROUTES] Response saved to: ${filepath}`);
    return filepath;
  } catch (error) {
    console.error(`[CRYPTO_ROUTES] Failed to write response file:`, error);
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

  console.error(`[CRYPTO_ROUTES] ${context} failed:`, message);
  if (stack) console.error(`[CRYPTO_ROUTES] ${context} stack:`, stack);

  let errorCode = "intelligence_failed";
  let httpStatus = statusCode;

  if (message.includes("not a recognized crypto") || message.includes("crypto ticker doesnt exist")) {
    errorCode = "wrong_ticker";
    httpStatus = 404;
  } else if (message.includes("matches multiple") || message.includes("ambiguous")) {
    errorCode = "ambiguous_crypto";
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
    `SELECT id FROM assets.assets WHERE symbol = $1 AND asset_type = 'crypto' LIMIT 1`,
    [ticker]
  );

  if (assetRes.rows.length === 0) {
    return { exists: false, fresh: false, assetId: null };
  }

  const assetId = assetRes.rows[0]["id"] as string;

  // Check that we have crypto data + at least some market data
  const checks = await Promise.all([
    pool.query(
      `SELECT 1 FROM assets.crypto WHERE asset_id = $1 LIMIT 1`,
      [assetId]
    ),
    pool.query(
      `SELECT updated_at FROM assets.crypto WHERE asset_id = $1`,
      [assetId]
    ),
  ]);

  const hasCrypto = checks[0].rows.length > 0;
  const cryptoRow = checks[1].rows[0];

  const updatedAt = cryptoRow?.["updated_at"];
  const isFresh = updatedAt
    ? Date.now() - new Date(updatedAt).getTime() <= 7 * 24 * 60 * 60 * 1000
    : false;

  return {
    exists: true,
    fresh: hasCrypto && isFresh,
    assetId,
  };
}

/**
 * Reads the asset profile from assets.assets + assets.crypto for a given assetId.
 */
async function readAssetFromDB(assetId: string, ticker: string): Promise<CryptoAsset> {
  const res = await pool.query(
    `SELECT a.name, a.external_ids, a.website_url, a.logo_url,
            c.network, c.contract_addresses
     FROM assets.assets a
     LEFT JOIN assets.crypto c ON c.asset_id = a.id
     WHERE a.id = $1 AND a.asset_type = 'crypto'`,
    [assetId]
  );

  const row = res.rows[0];
  const externalIds = (row?.["external_ids"] as Record<string, unknown> | null) ?? {};

  return {
    name: (typeof row?.["name"] === "string" && row["name"] !== "")
      ? (row["name"] as string)
      : ticker,
    symbol: ticker,
    category: null,
    description: null,
    logoUrl: (typeof row?.["logo_url"] === "string") ? (row["logo_url"] as string) : null,
    website: (typeof row?.["website_url"] === "string") ? (row["website_url"] as string) : null,
    externalIds: {
      coingeckoId: (typeof externalIds["coingecko_id"] === "string")
        ? (externalIds["coingecko_id"] as string)
        : ticker.toLowerCase(),
    },
  };
}

/**
 * Reads the market data from assets.crypto for a given assetId.
 */
async function readMarketFromDB(assetId: string): Promise<CryptoMarket> {
  const res = await pool.query(
    `SELECT circulating_supply, total_supply, max_supply, security_summary, updated_at
     FROM assets.crypto
     WHERE asset_id = $1`,
    [assetId]
  );

  const row = res.rows[0];
  const circulating = row?.["circulating_supply"] !== null ? Number(row["circulating_supply"]) : null;
  const maxSupply = row?.["max_supply"] !== null ? Number(row["max_supply"]) : null;

  return {
    price: null,
    currency: "USD",
    change24h: null,
    changePercent24h: null,
    changeSincePreviousClose: null,
    changePercentSincePreviousClose: null,
    high24h: null,
    low24h: null,
    marketCap: null,
    marketCapRank: null,
    fullyDilutedValuation: null,
    marketCapDominance: null,
    volume24h: null,
    quoteVolume24h: null,
    volumeToMarketCap: null,
    allTimeHigh: null,
    allTimeHighDate: null,
    allTimeLow: null,
    allTimeLowDate: null,
    priceChange7d: null,
    priceChange30d: null,
    priceChange90d: null,
    priceUpdatedAt: row?.["updated_at"] !== null ? new Date(row["updated_at"]).toISOString() : null,
    source: "CoinGecko",
  };
}

/**
 * Reads supply data from assets.crypto for a given assetId.
 */
async function readSupplyFromDB(assetId: string): Promise<CryptoSupply> {
  const res = await pool.query(
    `SELECT circulating_supply, total_supply, max_supply
     FROM assets.crypto
     WHERE asset_id = $1`,
    [assetId]
  );

  const row = res.rows[0];
  const circulating = row?.["circulating_supply"] !== null ? Number(row["circulating_supply"]) : null;
  const total = row?.["total_supply"] !== null ? Number(row["total_supply"]) : null;
  const max = row?.["max_supply"] !== null ? Number(row["max_supply"]) : null;

  const circulatingPercentage =
    circulating !== null && max !== null && max > 0
      ? (circulating / max) * 100
      : null;

  return {
    circulating,
    total,
    max,
    circulatingPercentage,
  };
}

/**
 * Reads network data from assets.crypto for a given assetId.
 */
async function readNetworkFromDB(assetId: string): Promise<CryptoNetwork> {
  const res = await pool.query(
    `SELECT network, contract_addresses
     FROM assets.crypto
     WHERE asset_id = $1`,
    [assetId]
  );

  const row = res.rows[0];
  const contracts: Array<{ network: string; address: string }> =
    Array.isArray(row?.["contract_addresses"]) ? row["contract_addresses"] : [];

  return {
    primary: (typeof row?.["network"] === "string") ? (row["network"] as string) : null,
    contracts: contracts.map((c) => ({
      network: c.network,
      address: c.address,
    })),
  };
}

/* ============================================================================
 * DATABASE WRITE HELPERS
 * ============================================================================ */

/**
 * Upserts the canonical asset row and returns its UUID.
 */
async function upsertAsset(ticker: string, asset: CryptoAsset): Promise<string> {
  const existing = await pool.query(
    `SELECT id FROM assets.assets WHERE symbol = $1 AND asset_type = 'crypto' LIMIT 1`,
    [ticker]
  );

  const externalIds = {
    coingecko_id: asset.externalIds.coingeckoId,
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
      [id, JSON.stringify(externalIds), asset.website ?? null, asset.logoUrl ?? null]
    );
    return id;
  }

  const insertRes = await pool.query(
    `INSERT INTO assets.assets (symbol, name, asset_type, website_url, logo_url, external_ids)
     VALUES ($1, $2, 'crypto', $3, $4, $5::jsonb)
     RETURNING id`,
    [ticker, asset.name, asset.website ?? null, asset.logoUrl ?? null, JSON.stringify(externalIds)]
  );

  const row = insertRes.rows[0];
  const id = row?.["id"];
  if (typeof id !== "string") {
    throw new Error(`Crypto asset insert for ${ticker} returned no id.`);
  }
  return id;
}

/**
 * Upserts the assets.crypto row.
 */
async function upsertCrypto(
  assetId: string,
  network: CryptoNetwork,
  supply: CryptoSupply,
  tokenomics: Record<string, unknown>,
  socials: Record<string, unknown>,
  exchanges: Array<{ name: string; symbol: string; volume24h: number | null; quoteVolume24h: number | null; percentOfTotalVolume: number | null; isVerified: boolean }>,
  securitySummary: string | null
): Promise<void> {
  const existing = await pool.query(
    `SELECT 1 FROM assets.crypto WHERE asset_id = $1 LIMIT 1`,
    [assetId]
  );

  const contractAddresses = network.contracts.map((c) => ({
    network: c.network,
    address: c.address,
    source: "CoinGecko",
    verified: false,
  }));

  const exchangesJson = exchanges.map((e) => ({
    name: e.name,
    symbol: e.symbol,
    volume24h: e.volume24h,
    quoteVolume24h: e.quoteVolume24h,
    percentOfTotalVolume: e.percentOfTotalVolume,
    isVerified: e.isVerified,
  }));

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE assets.crypto
       SET network = COALESCE($2, network),
           contract_addresses = $3::jsonb,
           circulating_supply = COALESCE($4, circulating_supply),
           total_supply = COALESCE($5, total_supply),
           max_supply = COALESCE($6, max_supply),
           tokenomics = $7::jsonb,
           holder_distribution = '{}'::jsonb,
           contract_analysis = '{}'::jsonb,
           socials = $8::jsonb,
           exchanges = $9::jsonb,
           security_summary = COALESCE($10, security_summary),
           updated_at = NOW()
       WHERE asset_id = $1`,
      [
        assetId,
        network.primary,
        JSON.stringify(contractAddresses),
        supply.circulating,
        supply.total,
        supply.max,
        JSON.stringify(tokenomics),
        JSON.stringify(socials),
        JSON.stringify(exchangesJson),
        securitySummary,
      ]
    );
    return;
  }

  await pool.query(
    `INSERT INTO assets.crypto
       (asset_id, network, contract_addresses, circulating_supply, total_supply, max_supply,
        tokenomics, holder_distribution, contract_analysis, socials, exchanges, security_summary)
     VALUES
       ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, '{}'::jsonb, '{}'::jsonb, $8::jsonb, $9::jsonb, $10)`,
    [
      assetId,
      network.primary,
      JSON.stringify(contractAddresses),
      supply.circulating,
      supply.total,
      supply.max,
      JSON.stringify(tokenomics),
      JSON.stringify(socials),
      JSON.stringify(exchangesJson),
      securitySummary,
    ]
  );
}

/* ============================================================================
 * MIDDLEWARE: Request Logging
 * ============================================================================ */

function requestLogger(req: Request, res: Response, next: () => void) {
  const startTime = Date.now();
  console.log(`[CRYPTO_ROUTES] ${req.method} ${req.path} - Params:`, req.params, "Query:", req.query);

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(`[CRYPTO_ROUTES] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
}

router.use(requestLogger);

/* ============================================================================
 * ROUTE: GET /api-v1/crypto/:ticker
 * ============================================================================ */

/**
 * GET /api-v1/crypto/:ticker
 *
 * Logic:
 * 1. Get ticker from path parameter
 * 2. Check if database has current data for this ticker
 * 3. If current -> return data from database
 * 4. If not current or no data -> fetch via cryptoNormalizer, inject into DB,
 *    then return data from database
 * 5. If ticker is not legitimate -> return error
 *
 * Output file: collectors/assets/data/crypto_intelligence_<TICKER>_<timestamp>.json
 */
router.get("/:ticker", async (req: Request, res: Response) => {
  const routeContext = "GET /:ticker";

  try {
    const { ticker } = req.params;

    // Validate ticker parameter
    if (!ticker || typeof ticker !== "string" || ticker.trim().length === 0) {
      console.warn(`[CRYPTO_ROUTES] ${routeContext} - Missing or invalid ticker`);
      return res.status(400).json({
        error: "validation_failed",
        message: "Ticker parameter is required"
      });
    }

    const cleanTicker = ticker.trim().toUpperCase();
    console.log(`[CRYPTO_ROUTES] ${routeContext} - Clean ticker:`, cleanTicker);

    // Parse query parameters
    const refresh = req.query.refresh === "true";
    console.log(`[CRYPTO_ROUTES] ${routeContext} - Options:`, { refresh });

    // Check DB freshness
    const freshness = await checkDbFreshness(cleanTicker);

    // If data is current and not forced refresh, return from DB
    if (freshness.exists && freshness.fresh && !refresh) {
      console.log(`[CRYPTO_ROUTES] ${routeContext} - DB data is current, returning from DB`);
      const simpleResponse = await buildResponseFromDB(freshness.assetId!, cleanTicker);
      await writeResponseToFile("crypto_intelligence", cleanTicker, simpleResponse);
      return res.status(200).json(simpleResponse);
    }

    // Fetch from providers via cryptoNormalizer
    console.log(`[CRYPTO_ROUTES] ${routeContext} - Fetching from providers via cryptoNormalizer`);
    const raw = await fetchCryptoIntelligence(cleanTicker);

    // Validate that we got legitimate data from at least one provider
    const hasCoingeckoData = !!raw.coingecko?.asset;
    const hasBinanceSpotData = !!raw.binanceSpot?.price || !!raw.binanceSpot?.ticker24hr;
    const hasBinanceFuturesData = !!raw.binanceFutures?.length;

    if (!hasCoingeckoData && !hasBinanceSpotData && !hasBinanceFuturesData) {
      console.warn(`[CRYPTO_ROUTES] ${routeContext} - No data returned for ticker: ${cleanTicker}`);
      return res.status(404).json({
        error: "wrong_ticker",
        message: `This crypto ticker doesnt exist: ${cleanTicker}`
      });
    }

    // Normalize into the target output shape
    const normalized = normalizeCryptoIntelligence(raw, cleanTicker);

    // Inject into SQL database
    const assetId = await upsertAsset(cleanTicker, normalized.asset);
    await upsertCrypto(
      assetId,
      normalized.network,
      normalized.supply,
      normalized.tokenomics,
      normalized.socials,
      normalized.exchanges,
      normalized.security.summary
    );

    console.log(`[CRYPTO_ROUTES] ${routeContext} - Data injected into database for asset ${assetId}`);

    // Return normalized response directly (market data not stored in DB schema)
    const simpleResponse = normalized;

    // Log concise result summary
    console.log(`[CRYPTO_ROUTES] ${routeContext} - Result:`, {
      ticker: simpleResponse.symbol,
      name: simpleResponse.asset.name,
      hasPrice: simpleResponse.market.price !== null,
      supplyCirculating: simpleResponse.supply.circulating !== null,
      dataUpdatedAt: simpleResponse.dataUpdatedAt,
    });

    // Write response to file
    await writeResponseToFile("crypto_intelligence", cleanTicker, simpleResponse);

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
async function buildResponseFromDB(
  assetId: string,
  ticker: string
): Promise<{
  symbol: string;
  asset: CryptoAsset;
  market: CryptoMarket;
  supply: CryptoSupply;
  network: CryptoNetwork;
  tokenomics: Record<string, unknown>;
  security: { summary: string | null; contractAnalysis: Record<string, unknown>; riskFlags: string[] };
  socials: Record<string, unknown>;
  exchanges: Array<{ name: string; symbol: string; volume24h: number | null; quoteVolume24h: number | null; percentOfTotalVolume: number | null; isVerified: boolean }>;
  dataUpdatedAt: string | null;
}> {
  const [asset, market, supply, network] = await Promise.all([
    readAssetFromDB(assetId, ticker),
    readMarketFromDB(assetId),
    readSupplyFromDB(assetId),
    readNetworkFromDB(assetId),
  ]);

  // Read crypto row for tokenomics, socials, exchanges, security
  const cryptoRes = await pool.query(
    `SELECT tokenomics, socials, exchanges, security_summary, updated_at
     FROM assets.crypto
     WHERE asset_id = $1`,
    [assetId]
  );

  const cryptoRow = cryptoRes.rows[0];
  const tokenomics = cryptoRow?.["tokenomics"] ?? {};
  const socials = cryptoRow?.["socials"] ?? {};
  const exchanges = Array.isArray(cryptoRow?.["exchanges"]) ? cryptoRow["exchanges"] : [];
  const securitySummary = cryptoRow?.["security_summary"] ?? null;

  const timestamps: string[] = [
    market.priceUpdatedAt,
    cryptoRow?.["updated_at"] !== null ? new Date(cryptoRow["updated_at"]).toISOString() : null,
  ].filter((t): t is string => t !== null);

  const dataUpdatedAt = timestamps.length > 0
    ? timestamps.reduce((latest, current) => (current > latest ? current : latest))
    : null;

  return {
    symbol: ticker,
    asset,
    market,
    supply,
    network,
    tokenomics,
    security: {
      summary: securitySummary,
      contractAnalysis: {},
      riskFlags: [],
    },
    socials,
    exchanges: exchanges.map((e: any) => ({
      name: e.name,
      symbol: e.symbol,
      volume24h: e.volume24h,
      quoteVolume24h: e.quoteVolume24h,
      percentOfTotalVolume: e.percentOfTotalVolume,
      isVerified: e.isVerified,
    })),
    dataUpdatedAt,
  };
}

/* ============================================================================
 * EXPORTS
 * ============================================================================ */

export default router;
