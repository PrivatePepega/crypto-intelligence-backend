/**
 * Commodity Routes - Single GET /:ticker endpoint
 *
 * Deterministic commodity intelligence flow:
 * 1. GET /api-v1/commodities/:ticker - takes a commodity symbol (e.g., GCUSD, RWTC)
 * 2. Try fetch from commodities normalizer (FMP) - if valid price, return it
 * 3. If no commodity data, try energy normalizer (EIA) - if valid price, return it
 * 4. If neither produces valid data -> return 404 "not a real ticker"
 * 5. Write output to collectors/assets/data/commodities_intelligence_<TICKER>_<timestamp>.json
 *
 * Output file: collectors/assets/data/commodities_intelligence_<TICKER>_<timestamp>.json
 */

import { Router } from "express";
import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import pool from "../config/database.js";
import {
  fetchCommodityIntelligence,
  normalizeCommodityIntelligence,
  type CommodityIntelligenceData,
  type CommodityAsset,
  type CommodityMarket,
  type Commodity,
} from "../collectors/assets/commodities/commoditiesNormalizer.js";
import {
  fetchEnergyIntelligence,
  normalizeEnergyIntelligence,
  type EnergyIntelligenceData,
  type EnergyAsset,
  type Energy,
} from "../collectors/assets/energy/energyNormalizer.js";

const router = Router();

const DATA_OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/data");

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================ */

async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(DATA_OUTPUT_DIR, { recursive: true }).catch(() => {});
}

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
    console.log(`[COMMODITY_ROUTES] Response saved to: ${filepath}`);
    return filepath;
  } catch (error) {
    console.error("[COMMODITY_ROUTES] Failed to write response file:", error);
    return "";
  }
}

function createErrorResponse(
  error: unknown,
  context: string,
  statusCode: number = 500
): { response: object; statusCode: number } {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[COMMODITY_ROUTES] ${context} failed:`, message);

  let errorCode = "intelligence_failed";
  let httpStatus = statusCode;

  if (
    message.includes("not a recognized commodity") ||
    message.includes("commodity ticker doesnt exist") ||
    message.includes("not a recognized stock") ||
    message.includes("is an ETF/fund") ||
    message.includes("not a real ticker")
  ) {
    errorCode = "wrong_ticker";
    httpStatus = 404;
  } else if (message.includes("validation")) {
    errorCode = "validation_failed";
    httpStatus = 400;
  }

  return {
    response: {
      error: errorCode,
      message: httpStatus >= 500 ? "Internal server error" : message,
    },
    statusCode: httpStatus,
  };
}

/* ============================================================================
 * DATABASE READ HELPERS
 * ============================================================================ */

async function checkDbFreshness(ticker: string): Promise<{
  exists: boolean;
  fresh: boolean;
  assetId: string | null;
}> {
  const assetRes = await pool.query(
    `SELECT id FROM assets.assets WHERE symbol = $1 AND asset_type = 'commodity' LIMIT 1`,
    [ticker]
  );

  if (assetRes.rows.length === 0) {
    return { exists: false, fresh: false, assetId: null };
  }

  const assetId = assetRes.rows[0]["id"] as string;

  const checks = await Promise.all([
    pool.query(
      `SELECT 1 FROM assets.commodities WHERE asset_id = $1 LIMIT 1`,
      [assetId]
    ),
    pool.query(
      `SELECT 1 FROM assets.asset_price_history WHERE asset_id = $1 AND interval = '1d' LIMIT 1`,
      [assetId]
    ),
    pool.query(
      `SELECT updated_at FROM assets.commodities WHERE asset_id = $1`,
      [assetId]
    ),
  ]);

  const hasCommodity = checks[0]?.rows?.length > 0;
  const hasCandles = checks[1]?.rows?.length > 0;
  const commodityRow = checks[0]?.rows?.[0];

  const updatedAt = commodityRow?.["updated_at"];
  const isFresh = updatedAt
    ? Date.now() - new Date(updatedAt).getTime() <= 7 * 24 * 60 * 60 * 1000
    : false;

  return {
    exists: true,
    fresh: (hasCommodity || hasCandles) && isFresh,
    assetId,
  };
}

async function readAssetFromDB(
  assetId: string,
  ticker: string
): Promise<CommodityAsset> {
  const res = await pool.query(
    `SELECT a.name, a.external_ids, a.website_url, a.logo_url,
            c.commodity_type, c.benchmark, c.currency, c.unit_of_measure,
            c.uses, c.value_drivers, c.supply_demand, c.inflation_data,
            c.contract_addresses
     FROM assets.assets a
     LEFT JOIN assets.commodities c ON c.asset_id = a.id
     WHERE a.id = $1 AND a.asset_type = 'commodity'`,
    [assetId]
  );

  const row = res.rows[0];
  const externalIds =
    (row?.["external_ids"] as Record<string, unknown> | null) ?? {};

  return {
    name:
      typeof row?.["name"] === "string" && row["name"] !== ""
        ? (row["name"] as string)
        : ticker,
    symbol: ticker,
    category: null,
    description: null,
    logoUrl:
      typeof row?.["logo_url"] === "string"
        ? (row["logo_url"] as string)
        : null,
    website:
      typeof row?.["website_url"] === "string"
        ? (row["website_url"] as string)
        : null,
    externalIds: {
      fmpSymbol:
        typeof externalIds["fmpSymbol"] === "string"
          ? (externalIds["fmpSymbol"] as string)
          : typeof externalIds["eiaSeriesId"] === "string"
            ? (externalIds["eiaSeriesId"] as string)
            : ticker,
    },
  };
}

async function readMarketFromDB(
  assetId: string
): Promise<CommodityMarket> {
  const res = await pool.query(
    `SELECT open, high, low, close, volume, timestamp
     FROM assets.asset_price_history
     WHERE asset_id = $1 AND interval = '1d'
     ORDER BY timestamp DESC
     LIMIT 1`,
    [assetId]
  );

  const row = res.rows[0];
  const close =
    row?.["close"] !== null ? Number(row["close"]) : null;
  const open =
    row?.["open"] !== null ? Number(row["open"]) : close ?? 0;
  const high =
    row?.["high"] !== null ? Number(row["high"]) : close ?? 0;
  const low =
    row?.["low"] !== null ? Number(row["low"]) : close ?? 0;
  const previousClose = close;

  let change: number | null = null;
  let changePercent: number | null = null;

  if (close !== null && open !== null && open !== 0) {
    change = close - open;
    changePercent = (change / open) * 100;
  }

  const allHighs = res.rows
    .map((r) => Number(r["high"]))
    .filter((h) => Number.isFinite(h));
  const allLows = res.rows
    .map((r) => Number(r["low"]))
    .filter((l) => Number.isFinite(l));
  const yearHigh = allHighs.length > 0 ? Math.max(...allHighs) : null;
  const yearLow = allLows.length > 0 ? Math.min(...allLows) : null;

  const closes = res.rows
    .map((r) => Number(r["close"]))
    .filter((c) => Number.isFinite(c))
    .reverse();

  const sma = (period: number): number | null => {
    if (closes.length < period) return null;
    const sum = closes.slice(0, period).reduce((a, b) => a + b, 0);
    return sum / period;
  };

  return {
    price: close,
    currency: "USD",
    change,
    changePercent,
    previousClose,
    open,
    dayHigh: high,
    dayLow: low,
    yearHigh,
    yearLow,
    volume:
      row?.["volume"] !== null ? Number(row["volume"]) : null,
    vwap: null,
    movingAverages: { sma50: sma(50), sma200: sma(200) },
    priceUpdatedAt:
      row?.["timestamp"] !== null
        ? new Date(row["timestamp"]).toISOString()
        : null,
    source: "FMP",
  };
}

/* ============================================================================
 * DATABASE WRITE HELPERS
 * ============================================================================ */

async function upsertAsset(
  ticker: string,
  asset: CommodityAsset
): Promise<string> {
  const existing = await pool.query(
    `SELECT id FROM assets.assets WHERE symbol = $1 AND asset_type = 'commodity' LIMIT 1`,
    [ticker]
  );

  const externalIds = {
    fmp: {
      symbol: asset.externalIds.fmpSymbol,
      name: asset.name,
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
      [
        id,
        JSON.stringify(externalIds),
        asset.website ?? null,
        asset.logoUrl ?? null,
      ]
    );
    return id;
  }

  const insertRes = await pool.query(
    `INSERT INTO assets.assets (symbol, name, asset_type, website_url, logo_url, external_ids)
     VALUES ($1, $2, 'commodity', $3, $4, $5::jsonb)
     RETURNING id`,
    [
      ticker,
      asset.name,
      asset.website ?? null,
      asset.logoUrl ?? null,
      JSON.stringify(externalIds),
    ]
  );

  const row = insertRes.rows[0];
  const id = row?.["id"];
  if (typeof id !== "string") {
    throw new Error(`Commodity asset insert for ${ticker} returned no id.`);
  }
  return id;
}

async function upsertCommodity(
  assetId: string,
  commodity: Commodity
): Promise<void> {
  const existing = await pool.query(
    `SELECT 1 FROM assets.commodities WHERE asset_id = $1 LIMIT 1`,
    [assetId]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE assets.commodities
       SET commodity_type = COALESCE($2, commodity_type),
           benchmark = COALESCE($3, benchmark),
           currency = COALESCE($4, currency),
           uses = $5::jsonb,
           value_drivers = '{}'::jsonb,
           supply_demand = '{}'::jsonb,
           inflation_data = '{}'::jsonb,
           updated_at = NOW()
       WHERE asset_id = $1`,
      [
        assetId,
        commodity.type,
        commodity.benchmark,
        commodity.currency,
        JSON.stringify(commodity.uses),
      ]
    );
    return;
  }

  await pool.query(
    `INSERT INTO assets.commodities
       (asset_id, commodity_type, benchmark, currency, unit_of_measure,
        uses, value_drivers, supply_demand, inflation_data)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)`,
    [
      assetId,
      commodity.type,
      commodity.benchmark,
      commodity.currency,
      commodity.unitOfMeasure,
      JSON.stringify(commodity.uses),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify({}),
    ]
  );
}

/* ============================================================================
 * MIDDLEWARE: Request Logging
 * ============================================================================ */

function requestLogger(req: Request, res: Response, next: () => void) {
  const startTime = Date.now();
  console.log(
    `[COMMODITY_ROUTES] ${req.method} ${req.path} - Params:`,
    req.params,
    "Query:",
    req.query
  );

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(
      `[COMMODITY_ROUTES] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
    );
  });

  next();
}

router.use(requestLogger);

/* ============================================================================
 * ROUTE: GET /api-v1/commodities/:ticker
 * ============================================================================ */

router.get("/:ticker", async (req: Request, res: Response) => {
  const routeContext = "GET /:ticker";

  try {
    const { ticker } = req.params;

    if (
      !ticker ||
      typeof ticker !== "string" ||
      ticker.trim().length === 0
    ) {
      console.warn(
        `[COMMODITY_ROUTES] ${routeContext} - Missing or invalid ticker`
      );
      return res.status(400).json({
        error: "validation_failed",
        message: "Ticker parameter is required",
      });
    }

    const cleanTicker = ticker.trim().toUpperCase();
    console.log(`[COMMODITY_ROUTES] ${routeContext} - Clean ticker:`, cleanTicker);

    const refresh = req.query.refresh === "true";
    console.log(`[COMMODITY_ROUTES] ${routeContext} - Options:`, { refresh });

    // Check DB freshness
    const freshness = await checkDbFreshness(cleanTicker);

    if (freshness.exists && freshness.fresh && !refresh) {
      console.log(
        `[COMMODITY_ROUTES] ${routeContext} - DB data is current, returning from DB`
      );
      const simpleResponse = await buildResponseFromDB(
        freshness.assetId!,
        cleanTicker
      );
      await writeResponseToFile(
        "commodities_intelligence",
        cleanTicker,
        simpleResponse
      );
      return res.status(200).json(simpleResponse);
    }

    // Step 1: Fetch from commodity providers (FMP)
    console.log(
      `[COMMODITY_ROUTES] ${routeContext} - Fetching from commodity providers (FMP)`
    );
    const raw = await fetchCommodityIntelligence(cleanTicker);
    const commodityQuote = raw?.quote;

    // Step 2: If commodity has no valid price, try energy providers (EIA)
    let energyData: EnergyIntelligenceData | null = null;
    if (!commodityQuote || commodityQuote.price === null) {
      console.log(
        `[COMMODITY_ROUTES] ${routeContext} - No commodity data, trying energy providers (EIA)`
      );
      const energyRaw = await fetchEnergyIntelligence(cleanTicker);
      energyData = energyRaw.quote
        ? normalizeEnergyIntelligence(energyRaw, cleanTicker)
        : null;
    }

    const commodityValid =
      commodityQuote && commodityQuote.price !== null;
    const energyDataValid =
      energyData && energyData.market.price !== null;

    if (!commodityValid && !energyDataValid) {
      console.warn(
        `[COMMODITY_ROUTES] ${routeContext} - No data returned for ticker: ${cleanTicker}`
      );
      return res.status(404).json({
        error: "wrong_ticker",
        message: `This commodity ticker doesnt exist: ${cleanTicker}`,
      });
    }

    // Use commodity data if available, otherwise energy data
    let normalized: CommodityIntelligenceData | EnergyIntelligenceData;
    let isEnergy = false;

    if (commodityValid) {
      normalized = normalizeCommodityIntelligence(raw, cleanTicker);
    } else if (energyDataValid && energyData) {
      normalized = energyData;
      isEnergy = true;
    } else {
      return res.status(404).json({
        error: "wrong_ticker",
        message: `This commodity ticker doesnt exist: ${cleanTicker}`,
      });
    }

    // Inject into SQL database
    let assetId: string;
    if (commodityValid) {
      assetId = await upsertAsset(
        cleanTicker,
        normalized.asset as CommodityAsset
      );
      await upsertCommodity(assetId, normalized.commodity as Commodity);
    } else {
      // energy path
      const energyAsset = normalized.asset as EnergyAsset;
      const energyRes = await pool.query(
        `INSERT INTO assets.assets (symbol, name, asset_type, website_url, logo_url, external_ids)
         VALUES ($1, $2, 'commodity', $3, $4, $5::jsonb)
         RETURNING id`,
        [
          energyAsset.symbol,
          energyAsset.name,
          energyAsset.website ?? null,
          null,
          JSON.stringify({
            eia_series_id: energyAsset.externalIds.eiaSeriesId,
          }),
        ]
      );
      assetId = energyRes.rows[0].id as string;

      const energyCommodity = normalized.commodity as Energy;
      await pool.query(
        `INSERT INTO assets.commodities
           (asset_id, commodity_type, benchmark, currency, unit_of_measure,
            uses, value_drivers, supply_demand, inflation_data)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)`,
        [
          assetId,
          energyCommodity.type,
          energyCommodity.benchmark,
          energyCommodity.currency,
          energyCommodity.unitOfMeasure,
          JSON.stringify([]),
          JSON.stringify(normalized.fundamentals.valueDrivers),
          JSON.stringify(normalized.fundamentals.supplyDemand),
          JSON.stringify(normalized.fundamentals.inflation),
        ]
      );
    }

    console.log(
      `[COMMODITY_ROUTES] ${routeContext} - Data injected into database for asset ${assetId}`
    );

    const simpleResponse = normalized;

    console.log(`[COMMODITY_ROUTES] ${routeContext} - Result:`, {
      ticker: simpleResponse.symbol,
      name: simpleResponse.asset.name,
      hasPrice: simpleResponse.market.price !== null,
      dataUpdatedAt: simpleResponse.dataUpdatedAt,
      source: isEnergy ? "EIA" : "FMP",
    });

    await writeResponseToFile(
      "commodities_intelligence",
      cleanTicker,
      simpleResponse
    );

    return res.status(200).json(simpleResponse);
  } catch (error) {
    const { response, statusCode } = createErrorResponse(
      error,
      routeContext,
      500
    );
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
  asset: CommodityAsset;
  market: CommodityMarket;
  dataUpdatedAt: string | null;
}> {
  const asset = await readAssetFromDB(assetId, ticker);

  const commodityRes = await pool.query(
    `SELECT commodity_type, benchmark, currency, unit_of_measure,
            uses, value_drivers, supply_demand, inflation_data, updated_at
     FROM assets.commodities
     WHERE asset_id = $1`,
    [assetId]
  );

  const commodityRow = commodityRes.rows[0];
  const dataUpdatedAt = commodityRow?.["updated_at"]
    ? new Date(commodityRow["updated_at"]).toISOString()
    : null;

  const market = await readMarketFromDB(assetId);

  return {
    symbol: ticker,
    asset,
    market,
    dataUpdatedAt,
  };
}

export default router;