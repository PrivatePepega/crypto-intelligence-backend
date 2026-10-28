import "dotenv/config";

import pool from "../../config/database.js";
import { fmpGet, setFmpRequestsPerMinute, setFmpRequestBudget, resetFmpRequestUsage } from "../../collectors/assets/commodities/fmpClient.js";
import { resolveCommodity, searchCommodities } from "./commodityResolver.js";
import { getCommodityCoverage, needsCommodityRefresh } from "./commodityCoverage.js";
import { createCommodityIngestionPlan } from "./commodityFreshnessPolicy.js";
import {
  normalizeCommodityProfile,
  normalizeCommodityMarketSnapshot,
  normalizeCommodityHistory,
  buildCommoditySnapshotKey,
  buildCommoditySnapshotData,
} from "./commodityNormalizers.js";
import {
  upsertCommodityAsset,
  upsertCommodityProfile,
  insertCommoditySnapshot,
  upsertCommodityCandles,
  readCommodityState,
  withTransaction,
  type CommodityAssetUpsertResult,
  type CandleUpsertResult,
  type SnapshotInsertResult,
} from "./commodityRepository.js";
import {
  collectCommodityProfile,
  collectCommodityMarket,
  collectCommodityHistory,
  type ProfileCollectionResult,
  type MarketCollectionResult,
  type HistoryCollectionResult,
} from "./commodityAdapters.js";
import type {
  CommodityIdentity,
  CommodityResolutionResult,
  CommodityCoverageReport,
  CommodityIngestionPlan,
  CommodityIntelligenceResult,
  GetOrIngestCommodityOptions,
  CommodityDatasetName,
  CommodityPriceHistory,
  CommodityProfile,
  CommodityMarketSnapshot,
  CommodityCandle,
} from "../../types/commodities/commodity.types.js";

/* -------------------------------------------------------------------------- */
/*                           Persistence Helpers                              */
/* -------------------------------------------------------------------------- */

async function persistProfile(
  identity: CommodityIdentity,
  profileResult: ProfileCollectionResult,
): Promise<{ assetId: string; profile: CommodityProfile | null }> {
  if (!profileResult.profile || !profileResult.listed) {
    return { assetId: identity.assetId, profile: null };
  }

  const profile = profileResult.profile;

  // Build complete identity with listed data
  const updatedIdentity: CommodityIdentity = {
    ...identity,
    symbol: profile.symbol,
    name: profile.name,
    commodityType: profile.commodityType,
    benchmark: profile.benchmark,
    currency: profile.currency,
    providerIds: { fmp: { symbol: profile.symbol, currency: identity.currency } },
  };

  const assetResult = await withTransaction(async (client) => {
    return upsertCommodityAsset(client, updatedIdentity, profile);
  });

  const assetId = assetResult.asset_id;

  if (assetResult.created || profile) {
    await withTransaction(async (client) => {
      await upsertCommodityProfile(client, assetId, profile);
    });
  }

  return { assetId, profile };
}

async function persistMarketSnapshot(
  assetId: string,
  marketResult: MarketCollectionResult,
): Promise<{ snapshot: CommodityMarketSnapshot | null; snapshotInsert: SnapshotInsertResult | null }> {
  if (!marketResult.snapshot) {
    return { snapshot: null, snapshotInsert: null };
  }

  const snapshot = marketResult.snapshot;
  const snapshotInsert = await withTransaction(async (client) => {
    return insertCommoditySnapshot(client, assetId, snapshot, marketResult.sourceUrl);
  });

  return { snapshot, snapshotInsert };
}

async function persistPriceHistory(
  assetId: string,
  historyResult: HistoryCollectionResult,
  quoteCurrency: string | null,
): Promise<CandleUpsertResult> {
  if (!historyResult.history || historyResult.history.candles.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  return withTransaction(async (client) => {
    return upsertCommodityCandles(client, assetId, historyResult.history!.candles, { quoteCurrency });
  });
}

/* -------------------------------------------------------------------------- */
/*                           Ingestion Executor                               */
/* -------------------------------------------------------------------------- */

interface IngestionResult {
  profile: { ok: boolean; profile: CommodityProfile | null; error: string | null };
  market: { ok: boolean; snapshot: CommodityMarketSnapshot | null; error: string | null };
  history: { ok: boolean; history: CommodityPriceHistory | null; error: string | null; candles: CandleUpsertResult | null };
  errors: Array<{ dataset: CommodityDatasetName; message: string }>;
}

async function executeCommodityIngestionPlan(
  identity: CommodityIdentity,
  plan: CommodityIngestionPlan,
  options: { historyRange?: { from: string; to: string } } = {},
): Promise<IngestionResult> {
  const errors: Array<{ dataset: CommodityDatasetName; message: string }> = [];

  // Default history range: last 365 days
  const to = options.historyRange?.to ?? new Date().toISOString().slice(0, 10);
  const from = options.historyRange?.from ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 1. Profile (must be first - creates asset)
  let profileResult: ProfileCollectionResult = { profile: null, listed: null, error: "not attempted", collectedAt: "" };
  let assetId = identity.assetId;
  let profile: CommodityProfile | null = null;

  if (plan.steps.some((s) => s.dataset === "profile")) {
    profileResult = await collectCommodityProfile(identity);
    if (profileResult.error) {
      errors.push({ dataset: "profile", message: profileResult.error });
    } else {
      const persisted = await persistProfile(identity, profileResult);
      assetId = persisted.assetId;
      profile = persisted.profile;
    }
  }

  // Ensure we have an assetId for subsequent steps
  // If profile step wasn't in plan or failed, look up existing asset
  if (!assetId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id FROM assets.assets WHERE asset_type = 'commodity' AND external_ids->'fmp'->>'symbol' = $1 LIMIT 1`,
        [identity.symbol]
      );
      if (result.rows.length > 0) {
        assetId = result.rows[0].id;
      }
    } finally {
      client.release();
    }
  }

  // If still no assetId, we can't proceed with other datasets
  if (!assetId && plan.steps.some(s => s.dataset !== "profile")) {
    errors.push({ dataset: "profile", message: "No asset ID available for ingestion" });
    return {
      profile: { ok: !profileResult.error, profile, error: profileResult.error },
      market: { ok: false, snapshot: null, error: "No asset ID" },
      history: { ok: false, history: null, error: "No asset ID", candles: null },
      errors,
    };
  }

  // 2. Market Snapshot
  let marketResult: MarketCollectionResult = { snapshot: null, error: "not attempted", collectedAt: "", sourceUrl: "" };
  let snapshot: CommodityMarketSnapshot | null = null;

  if (plan.steps.some((s) => s.dataset === "market_snapshot")) {
    marketResult = await collectCommodityMarket({ ...identity, assetId });
    if (marketResult.error) {
      errors.push({ dataset: "market_snapshot", message: marketResult.error });
    } else {
      const persisted = await persistMarketSnapshot(assetId, marketResult);
      snapshot = persisted.snapshot;
    }
  }

  // 3. Price History
  let historyResult: HistoryCollectionResult = { history: null, error: "not attempted", collectedAt: "" };
  let candleResult: CandleUpsertResult | null = null;

  if (plan.steps.some((s) => s.dataset === "price_history")) {
    try {
      historyResult = await collectCommodityHistory({ ...identity, assetId }, { from, to });
      if (historyResult.error) {
        errors.push({ dataset: "price_history", message: historyResult.error });
      } else {
        candleResult = await persistPriceHistory(assetId, historyResult, profile?.currency ?? null);
      }
    } catch (error) {
      errors.push({ dataset: "price_history", message: `History fetch failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  return {
    profile: { ok: !profileResult.error, profile, error: profileResult.error },
    market: { ok: !marketResult.error, snapshot, error: marketResult.error },
    history: { ok: !historyResult.error, history: historyResult.history, error: historyResult.error, candles: candleResult },
    errors,
  };
}

/* -------------------------------------------------------------------------- */
/*                           Main Service Entry                               */
/* -------------------------------------------------------------------------- */

/**
 * Main entry point: resolves a commodity, checks coverage, executes ingestion plan,
 * and returns the complete intelligence package.
 */
export async function getOrIngestCommodity(
  query: string,
  options: GetOrIngestCommodityOptions = { refresh: undefined, include: undefined, readOnly: undefined },
): Promise<CommodityIntelligenceResult> {
  // Configure FMP rate limiting
  setFmpRequestsPerMinute(120);
  setFmpRequestBudget(100);
  resetFmpRequestUsage(100);

  // 1. Resolve the commodity
  const resolution = await resolveCommodity(query);
  if (resolution.kind !== "resolved") {
    throw new Error(resolution.message);
  }

  let identity = resolution.identity;

  // 2. Get coverage report
  const coverage = await getCommodityCoverage(identity);

  // 3. If read-only, return current state
  if (options.readOnly) {
    return buildCommodityResult(identity, coverage, null, []);
  }

  // 4. Create ingestion plan
  const planOptions: { refresh?: boolean; include?: CommodityDatasetName[] } = {};
  if (options.refresh !== undefined) planOptions.refresh = options.refresh;
  if (options.include !== undefined) planOptions.include = options.include;
  const plan = createCommodityIngestionPlan(identity.assetId || "", identity.symbol, coverage, planOptions);

  // Default history range: last 365 days
  const historyTo = options.historyRange?.to ?? new Date().toISOString().slice(0, 10);
  const historyFrom = options.historyRange?.from ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 5. Execute plan if there's work to do
  let ingestionResult: IngestionResult | null = null;
  if (plan.steps.length > 0) {
    ingestionResult = await executeCommodityIngestionPlan(identity, plan, {
      historyRange: options.historyRange ?? { from: historyFrom, to: historyTo },
    });

    // Refresh identity with assigned assetId
    if (!identity.assetId && ingestionResult.profile.profile) {
      identity = { ...identity, assetId: ingestionResult.profile.profile.assetId };
    }
  }

  // 6. Get fresh coverage after ingestion
  const freshCoverage = await getCommodityCoverage(identity);

  // 7. Read back stored data for response
  const client = await pool.connect();
  try {
    const dbClient = {
      async query(text: string, values?: unknown[]) {
        const result = await client.query(text, values);
        return { rows: result.rows as Array<Record<string, unknown>>, rowCount: result.rowCount };
      },
    };
    const stored = await readCommodityState(dbClient, identity.symbol, {
      recentCandles: 30,
      recentSnapshots: 5,
    });

    return buildCommodityResult(identity, freshCoverage, stored, ingestionResult?.errors ?? []);
  } finally {
    client.release();
  }
}

/**
 * Builds the final result from stored data and ingestion results.
 */
function buildCommodityResult(
  identity: CommodityIdentity,
  coverage: CommodityCoverageReport,
  stored: Awaited<ReturnType<typeof readCommodityState>> | null,
  ingestionErrors: Array<{ dataset: CommodityDatasetName; message: string }>,
): CommodityIntelligenceResult {
  // Build profile from stored data
  let profile: CommodityProfile | null = null;
  if (stored?.profile) {
    const p = stored.profile;
    profile = {
      assetId: identity.assetId,
      symbol: identity.symbol,
      name: identity.name,
      commodityType: p.commodity_type as string | null,
      benchmark: p.benchmark as string | null,
      currency: p.currency as string | null,
      unitOfMeasure: p.unit_of_measure as string | null,
      uses: (p.uses as string[]) ?? [],
      valueDrivers: (p.value_drivers as Record<string, unknown>) ?? {},
      supplyDemand: (p.supply_demand as Record<string, unknown>) ?? {},
      inflationData: (p.inflation_data as Record<string, unknown>) ?? {},
      providerData: { fmp: p },
      updatedAt: p.updated_at as string,
    };
  }

  // Build market from latest snapshot
  let market: CommodityMarketSnapshot | null = null;
  const snapshots = stored?.snapshots ?? [];
  if (snapshots.length > 0) {
    const latest = snapshots[0];
    const data = latest.data as Record<string, unknown>;
    market = {
      provider: "FMP",
      symbol: identity.symbol,
      providerSymbol: data.providerSymbol as string,
      name: data.name as string | null,
      currency: data.currency as string | null,
      price: data.price as number,
      change: data.change as number | null,
      changePercent: data.changePercent as number | null,
      open: data.open as number | null,
      previousClose: data.previousClose as number | null,
      dayLow: data.dayLow as number | null,
      dayHigh: data.dayHigh as number | null,
      yearLow: data.yearLow as number | null,
      yearHigh: data.yearHigh as number | null,
      volume: data.volume as number | null,
      priceAvg50: data.priceAvg50 as number | null,
      priceAvg200: data.priceAvg200 as number | null,
      marketCap: data.marketCap as number | null,
      exchange: data.exchange as string | null,
      observedAt: data.observedAt as string | null,
      collectedAt: data.collectedAt as string,
    };
  }

  // Build price history from stored candles
  let priceHistory: CommodityPriceHistory | null = null;
  const candleCount = stored?.price_history.candle_count ?? 0;
  if (candleCount > 0) {
    const ph = stored!.price_history;
    priceHistory = {
      provider: "FMP",
      symbol: identity.symbol,
      interval: "1d",
      fetchedAt: new Date().toISOString(),
      requested: { from: null, to: null },
      candles: (ph.recent as Array<Record<string, unknown>>).map((c) => ({
        symbol: identity.symbol,
        date: c.timestamp ? c.timestamp.slice(0, 10) : "",
        timestamp: c.timestamp as string,
        open: c.open as number,
        high: c.high as number,
        low: c.low as number,
        close: c.close as number,
        volume: c.volume as number | null,
        change: null,
        changePercent: null,
        vwap: null,
      })).reverse(),
      rejected: [],
      duplicatesRemoved: 0,
      coverage: {
        earliestCandle: ph.earliest ?? null,
        latestCandle: ph.latest ?? null,
        expectedCount: null,
        actualCount: ph.candle_count,
        gaps: [],
      },
    };
  }

  return {
    identity,
    profile,
    market,
    priceHistory,
    coverage,
    errors: ingestionErrors,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Search/Autocomplete                           */
/* -------------------------------------------------------------------------- */

export async function autocompleteCommodities(query: string, limit = 10): Promise<import("../../types/commodities/commodity.types.js").CommoditySearchCandidate[]> {
  return searchCommodities(query, limit);
}