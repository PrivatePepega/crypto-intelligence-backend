import "dotenv/config";

import pool from "../../config/database.js";
import { fmpGet, setFmpRequestsPerMinute, setFmpRequestBudget, resetFmpRequestUsage } from "../../collectors/assets/commodities/fmpClient.js";
import { resolveCrypto, tryResolveNativeAsset, searchCrypto } from "./cryptoResolver.js";
import { getCryptoCoverage, needsCryptoRefresh } from "./cryptoCoverage.js";
import { createCryptoIngestionPlan } from "./cryptoFreshnessPolicy.js";
import {
  normalizeCryptoProfile,
  normalizeCryptoMarketSnapshot,
  normalizeCryptoOhlcCandles,
  buildCryptoIdentity,
} from "./cryptoNormalizers.js";
import {
  upsertCryptoAsset,
  upsertCryptoProfile,
  insertCryptoSnapshot,
  upsertCryptoCandles,
  insertCryptoEvent,
  readCryptoState,
  withTransaction,
  buildContractMetadataEvent,
  buildContractAnalysisEvent,
  buildTokenSupplyEvent,
  buildSecurityEvent,
  type SnapshotInsertResult,
  type CandleUpsertResult,
  type CryptoEventInsertResult,
} from "./cryptoRepository.js";
import {
  collectCoinGeckoProfile,
  collectCoinGeckoMarkets,
  collectCoinGeckoOhlc,
  collectAlchemyMetadata,
  collectAlchemyAnalysis,
  collectAlchemySupply,
  collectGoPlusSecurity,
  type ProfileCollectionResult,
  type MarketCollectionResult,
  type OhlcCollectionResult,
  type AlchemyMetadataCollectionResult,
  type AlchemyAnalysisCollectionResult,
  type AlchemySupplyCollectionResult,
  type GoPlusSecurityCollectionResult,
} from "./cryptoAdapters.js";
import type {
  CryptoIdentity,
  CryptoResolutionResult,
  CryptoCoverageReport,
  CryptoIngestionPlan,
  CryptoIntelligenceResult,
  GetOrIngestCryptoOptions,
  CryptoDatasetName,
  CryptoPriceHistory,
  CryptoProfile,
  CryptoMarketSnapshot,
  CryptoContractMetadata,
  CryptoContractAnalysis,
  CryptoTokenSupply,
  CryptoSecurityRecord,
  CryptoTokenomics,
  CryptoSocials,
  CryptoCandle,
} from "../../types/crypto/crypto.types.js";

/* -------------------------------------------------------------------------- */
/*                           Persistence Helpers                              */
/* -------------------------------------------------------------------------- */

async function persistProfile(
  identity: CryptoIdentity,
  profileResult: ProfileCollectionResult,
): Promise<{ assetId: string; profile: CryptoProfile | null }> {
  if (!profileResult.ok || !profileResult.profile || !profileResult.coingeckoProfile) {
    return { assetId: identity.assetId, profile: null };
  }

  const profile = profileResult.profile;
  const coingeckoProfile = profileResult.coingeckoProfile;

  // Build complete identity with Alchemy metadata if available
  const updatedIdentity = buildCryptoIdentity(coingeckoProfile, []);

  const assetResult = await withTransaction(async (client) => {
    return upsertCryptoAsset(client, updatedIdentity, profile);
  });

  const assetId = assetResult.asset_id;

  if (assetResult.created || profile) {
    await withTransaction(async (client) => {
      await upsertCryptoProfile(client, assetId, profile);
    });
  }

  return { assetId, profile };
}

async function persistMarketSnapshot(
  assetId: string,
  marketsResult: MarketCollectionResult,
): Promise<{ snapshot: CryptoMarketSnapshot | null; snapshotInsert: SnapshotInsertResult | null }> {
  if (marketsResult.snapshots.length === 0) {
    return { snapshot: null, snapshotInsert: null };
  }

  const snapshot = marketsResult.snapshots[0]!;
  const snapshotInsert = await withTransaction(async (client) => {
    return insertCryptoSnapshot(client, assetId, snapshot, marketsResult.snapshots[0]!.sourceUrl);
  });

  return { snapshot, snapshotInsert };
}

async function persistPriceHistory(
  assetId: string,
  ohlcResult: OhlcCollectionResult,
  quoteCurrency: string | null,
): Promise<CandleUpsertResult> {
  if (!ohlcResult.history || ohlcResult.history.candles.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  return withTransaction(async (client) => {
    return upsertCryptoCandles(client, assetId, ohlcResult.history!.candles, { quoteCurrency });
  });
}

async function persistContractMetadata(
  assetId: string,
  metadataResult: AlchemyMetadataCollectionResult,
): Promise<number> {
  let inserted = 0;
  const collectedAt = metadataResult.collectedAt;

  for (const metadata of metadataResult.metadata) {
    const eventData = buildContractMetadataEvent(metadata);
    const dedupeKey = `contract_metadata:${metadata.network}:${metadata.contractAddress}:${metadata.observedAt}`;

    const eventResult = await withTransaction(async (client) => {
      return insertCryptoEvent(client, {
        assetId,
        informationType: "event",
        source: "Alchemy",
        data: eventData,
        sourceUrl: metadata.explorerUrl,
        observedAt: metadata.observedAt,
        collectedAt,
        dedupeKey,
      });
    });

    if (eventResult.inserted) inserted++;
  }

  return inserted;
}

async function persistContractAnalysis(
  assetId: string,
  analysisResult: AlchemyAnalysisCollectionResult,
): Promise<number> {
  let inserted = 0;
  const collectedAt = analysisResult.collectedAt;

  for (const analysis of analysisResult.analyses) {
    const eventData = buildContractAnalysisEvent(analysis);
    const dedupeKey = `contract_analysis:${analysis.network}:${analysis.contractAddress}:${analysis.retrievedAt}`;

    const eventResult = await withTransaction(async (client) => {
      return insertCryptoEvent(client, {
        assetId,
        informationType: "event",
        source: "Alchemy",
        data: eventData,
        sourceUrl: analysis.explorerUrl,
        observedAt: analysis.retrievedAt,
        collectedAt,
        dedupeKey,
      });
    });

    if (eventResult.inserted) inserted++;
  }

  return inserted;
}

async function persistTokenSupply(
  assetId: string,
  supplyResult: AlchemySupplyCollectionResult,
): Promise<number> {
  let inserted = 0;
  const collectedAt = supplyResult.collectedAt;

  for (const supply of supplyResult.supplies) {
    const eventData = buildTokenSupplyEvent(supply);
    const dedupeKey = `token_supply:${supply.network}:${supply.contractAddress}:${supply.blockNumber ?? supply.blockTag}`;

    const eventResult = await withTransaction(async (client) => {
      return insertCryptoEvent(client, {
        assetId,
        informationType: "event",
        source: "Alchemy",
        data: eventData,
        sourceUrl: supply.explorerUrl,
        observedAt: supply.observedAt,
        collectedAt,
        dedupeKey,
      });
    });

    if (eventResult.inserted) inserted++;
  }

  return inserted;
}

async function persistSecurity(
  assetId: string,
  securityResult: GoPlusSecurityCollectionResult,
): Promise<boolean> {
  if (!securityResult.security) {
    return false;
  }

  const eventData = buildSecurityEvent(securityResult.security);
  const dedupeKey = `security:${securityResult.security.chainId}:${securityResult.security.contractAddress}:${securityResult.security.checkedAt}`;

  const eventResult = await withTransaction(async (client) => {
    return insertCryptoEvent(client, {
      assetId,
      informationType: "event",
      source: "GoPlus",
      data: eventData,
      sourceUrl: securityResult.security!.sourceUrl,
      observedAt: securityResult.security!.checkedAt,
      collectedAt: securityResult.collectedAt,
      dedupeKey,
    });
  });

  return eventResult.inserted;
}

/* -------------------------------------------------------------------------- */
/*                           Ingestion Executor                               */
/* -------------------------------------------------------------------------- */

interface IngestionResult {
  profile: { ok: boolean; profile: CryptoProfile | null; error: string | null };
  market: { ok: boolean; snapshot: CryptoMarketSnapshot | null; error: string | null };
  history: { ok: boolean; history: CryptoPriceHistory | null; error: string | null; candles: CandleUpsertResult | null };
  metadata: { ok: boolean; count: number; error: string | null };
  analysis: { ok: boolean; count: number; error: string | null };
  supply: { ok: boolean; count: number; error: string | null };
  security: { ok: boolean; inserted: boolean; error: string | null };
  errors: Array<{ dataset: CryptoDatasetName; message: string }>;
}

async function executeCryptoIngestionPlan(
  identity: CryptoIdentity,
  plan: CryptoIngestionPlan,
  options: { historyRange?: { from: string; to: string } } = {},
): Promise<IngestionResult> {
  const errors: Array<{ dataset: CryptoDatasetName; message: string }> = [];

  // Default history range: last 365 days
  const to = options.historyRange?.to ?? new Date().toISOString().slice(0, 10);
  const from = options.historyRange?.from ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 1. Profile (must be first - creates asset)
  let profileResult: ProfileCollectionResult = { ok: false, profile: null, coingeckoProfile: null, error: "not attempted", collectedAt: "" };
  let assetId = identity.assetId;
  let profile: CryptoProfile | null = null;

  if (plan.steps.some((s) => s.dataset === "profile")) {
    profileResult = await collectCoinGeckoProfile(identity.coingeckoId!);
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
        `SELECT id FROM assets.assets WHERE asset_type = 'crypto' AND external_ids->'coingecko'->>'id' = $1 LIMIT 1`,
        [identity.coingeckoId]
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
      market: { ok: false, snapshots: [], error: "No asset ID" },
      history: { ok: false, history: null, error: "No asset ID", candles: null },
      contractMetadata: { ok: false, metadata: [], error: "No asset ID" },
      contractAnalysis: { ok: false, analyses: [], error: "No asset ID" },
      tokenSupply: { ok: false, supplies: [], error: "No asset ID" },
      security: { ok: false, security: null, error: "No asset ID" },
      transfers: { ok: false, transfers: [], error: "No asset ID" },
      balances: { ok: false, balances: [], error: "No asset ID" },
      holderDistribution: { ok: false, distribution: [], error: "No asset ID" },
      errors,
    };
  }

  // 2. Market Snapshot
  let marketsResult: MarketCollectionResult = { ok: false, snapshots: [], error: "not attempted", collectedAt: "" };
  let snapshot: CryptoMarketSnapshot | null = null;

  if (plan.steps.some((s) => s.dataset === "market_snapshot")) {
    marketsResult = await collectCoinGeckoMarkets([identity.coingeckoId!]);
    if (marketsResult.error) {
      errors.push({ dataset: "market_snapshot", message: marketsResult.error });
    } else {
      const persisted = await persistMarketSnapshot(assetId, marketsResult);
      snapshot = persisted.snapshot;
    }
  }

  // 3. Price History (OHLC)
  let ohlcResult: OhlcCollectionResult = { ok: false, history: null, error: "not attempted", collectedAt: "" };
  let candleResult: CandleUpsertResult | null = null;

  if (plan.steps.some((s) => s.dataset === "price_history")) {
    try {
      ohlcResult = await collectCoinGeckoOhlc(identity.coingeckoId!, { days: 365 });
      if (ohlcResult.error) {
        errors.push({ dataset: "price_history", message: ohlcResult.error });
      } else {
        const coingeckoData = profile?.providerData.coingecko as { market?: { currentPrice?: number | null } } | undefined;
      candleResult = await persistPriceHistory(assetId, ohlcResult, coingeckoData?.market?.currentPrice ? "usd" : null);
      }
    } catch (error) {
      errors.push({ dataset: "price_history", message: `History fetch failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  // 4. Contract Metadata
  let metadataResult: AlchemyMetadataCollectionResult = { ok: false, metadata: [], error: "not attempted", collectedAt: "" };

  if (plan.steps.some((s) => s.dataset === "contract_metadata")) {
    metadataResult = await collectAlchemyMetadata({ ...identity, assetId });
    if (metadataResult.error) {
      errors.push({ dataset: "contract_metadata", message: metadataResult.error });
    } else {
      await persistContractMetadata(assetId, metadataResult);
    }
  }

  // 5. Contract Analysis
  let analysisResult: AlchemyAnalysisCollectionResult = { ok: false, analyses: [], error: "not attempted", collectedAt: "" };

  if (plan.steps.some((s) => s.dataset === "contract_analysis")) {
    analysisResult = await collectAlchemyAnalysis({ ...identity, assetId });
    if (analysisResult.error) {
      errors.push({ dataset: "contract_analysis", message: analysisResult.error });
    } else {
      await persistContractAnalysis(assetId, analysisResult);
    }
  }

  // 6. Token Supply
  let supplyResult: AlchemySupplyCollectionResult = { ok: false, supplies: [], error: "not attempted", collectedAt: "" };

  if (plan.steps.some((s) => s.dataset === "token_supply")) {
    supplyResult = await collectAlchemySupply({ ...identity, assetId });
    if (supplyResult.error) {
      errors.push({ dataset: "token_supply", message: supplyResult.error });
    } else {
      await persistTokenSupply(assetId, supplyResult);
    }
  }

  // 7. Security
  let securityResult: GoPlusSecurityCollectionResult = { ok: false, security: null, error: "not attempted", collectedAt: "" };

  if (plan.steps.some((s) => s.dataset === "security")) {
    securityResult = await collectGoPlusSecurity({ ...identity, assetId });
    if (securityResult.error) {
      errors.push({ dataset: "security", message: securityResult.error });
    } else {
      await persistSecurity(assetId, securityResult);
    }
  }

  return {
    profile: { ok: !profileResult.error, profile, error: profileResult.error },
    market: { ok: !marketsResult.error, snapshot, error: marketsResult.error },
    history: { ok: !ohlcResult.error, history: ohlcResult.history, error: ohlcResult.error, candles: candleResult },
    metadata: { ok: !metadataResult.error, count: metadataResult.metadata.length, error: metadataResult.error },
    analysis: { ok: !analysisResult.error, count: analysisResult.analyses.length, error: analysisResult.error },
    supply: { ok: !supplyResult.error, count: supplyResult.supplies.length, error: supplyResult.error },
    security: { ok: !securityResult.error, inserted: securityResult.security !== null, error: securityResult.error },
    errors,
  };
}

/* -------------------------------------------------------------------------- */
/*                           Main Service Entry                               */
/* -------------------------------------------------------------------------- */

/**
 * Main entry point: resolves a crypto asset, checks coverage, executes ingestion plan,
 * and returns the complete intelligence package.
 */
export async function getOrIngestCrypto(
  query: string,
  options: GetOrIngestCryptoOptions = { refresh: undefined, include: undefined, readOnly: undefined },
): Promise<CryptoIntelligenceResult> {
  // Configure rate limiting (reuse FMP limiter for now)
  setFmpRequestsPerMinute(120);
  setFmpRequestBudget(100);
  resetFmpRequestUsage(100);

  // 1. Resolve the crypto asset
  let identity: CryptoIdentity;
  let resolution: CryptoResolutionResult;

  // Check native assets first
  const native = tryResolveNativeAsset(query);
  if (native) {
    identity = native;
    resolution = { kind: "resolved", identity };
  } else {
    const resolveOptions: { network?: string; contractAddress?: string } = {};
    if (options.network !== undefined) resolveOptions.network = options.network;
    if (options.contractAddress !== undefined) resolveOptions.contractAddress = options.contractAddress;
    resolution = await resolveCrypto(query, resolveOptions);
  }

  if (resolution.kind !== "resolved") {
    throw new Error(resolution.message);
  }

  identity = resolution.identity;

  // 2. Get coverage report
  const coverage = await getCryptoCoverage(identity);

  // 3. If read-only, return current state
  if (options.readOnly) {
    return buildCryptoResult(identity, coverage, null, []);
  }

  // 4. Create ingestion plan
  const planOptions: { refresh?: boolean; include?: CryptoDatasetName[]; network?: string; contractAddress?: string } = {};
  if (options.refresh !== undefined) planOptions.refresh = options.refresh;
  if (options.include !== undefined) planOptions.include = options.include;
  if (options.network !== undefined) planOptions.network = options.network;
  if (options.contractAddress !== undefined) planOptions.contractAddress = options.contractAddress;
  const plan = createCryptoIngestionPlan(identity.assetId || "", identity.symbol, coverage, planOptions);

  // 5. Execute plan if there's work to do
  let ingestionResult: IngestionResult | null = null;
  if (plan.steps.length > 0) {
    const historyTo = options.historyRange?.to ?? new Date().toISOString().slice(0, 10);
    const historyFrom = options.historyRange?.from ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    ingestionResult = await executeCryptoIngestionPlan(identity, plan, {
      historyRange: { from: historyFrom, to: historyTo },
    });

    // Refresh identity with assigned assetId
    if (!identity.assetId && ingestionResult.profile.profile) {
      identity = { ...identity, assetId: ingestionResult.profile.profile.assetId };
    }
  }

  // 6. Get fresh coverage after ingestion
  const freshCoverage = await getCryptoCoverage(identity);

  // 7. Read back stored data for response
  const client = await pool.connect();
  try {
    const dbClient = {
      async query(text: string, values?: unknown[]) {
        const result = await client.query(text, values);
        return { rows: result.rows as Array<Record<string, unknown>>, rowCount: result.rowCount };
      },
    };
    const stored = await readCryptoState(dbClient, identity.symbol, {
      recentCandles: 30,
      recentSnapshots: 5,
      recentEvents: 20,
    });

    return buildCryptoResult(identity, freshCoverage, stored, ingestionResult?.errors ?? []);
  } finally {
    client.release();
  }
}

/**
 * Builds the final result from stored data and ingestion results.
 */
function buildCryptoResult(
  identity: CryptoIdentity,
  coverage: CryptoCoverageReport,
  stored: Awaited<ReturnType<typeof readCryptoState>> | null,
  ingestionErrors: Array<{ dataset: CryptoDatasetName; message: string }>,
): CryptoIntelligenceResult {
  // Build profile from stored data
  let profile: CryptoProfile | null = null;
  if (stored?.profile) {
    const p = stored.profile;
    profile = {
      assetId: identity.assetId,
      symbol: identity.symbol,
      name: identity.name,
      network: p.network as string | null,
      coingeckoId: identity.coingeckoId,
      description: null,
      category: null,
      logoUrl: null,
      websiteUrl: null,
      genesisDate: ((p.tokenomics as Record<string, unknown> | undefined)?.genesisDate as string | null) ?? null,
      hashingAlgorithm: ((p.tokenomics as Record<string, unknown> | undefined)?.hashingAlgorithm as string | null) ?? null,
      blockTimeMinutes: ((p.tokenomics as Record<string, unknown> | undefined)?.blockTimeMinutes as number | null) ?? null,
      providerData: { coingecko: p },
      updatedAt: p.updated_at as string,
    };
  }

  // Build market from latest snapshot
  let market: CryptoMarketSnapshot | null = null;
  const snapshots = stored?.snapshots ?? [];
  if (snapshots.length > 0) {
    const latest = snapshots[0]!;
    const data = latest.data as Record<string, unknown>;
    market = {
      provider: "CoinGecko",
      coingeckoId: data.coingeckoId as string,
      vsCurrency: data.vsCurrency as string,
      currentPrice: data.currentPrice as number | null,
      marketCap: data.marketCap as number | null,
      fullyDilutedValuation: data.fullyDilutedValuation as number | null,
      marketCapRank: data.marketCapRank as number | null,
      totalVolume: data.totalVolume as number | null,
      totalValueLocked: data.totalValueLocked as number | null,
      high24h: data.high24h as number | null,
      low24h: data.low24h as number | null,
      priceChange24h: data.priceChange24h as number | null,
      priceChangePercentage24h: data.priceChangePercentage24h as number | null,
      priceChangePercentage7d: data.priceChangePercentage7d as number | null,
      priceChangePercentage30d: data.priceChangePercentage30d as number | null,
      marketCapChange24h: data.marketCapChange24h as number | null,
      marketCapChangePercentage24h: data.marketCapChangePercentage24h as number | null,
      ath: data.ath as number | null,
      athDate: data.athDate as string | null,
      athChangePercentage: data.athChangePercentage as number | null,
      atl: data.atl as number | null,
      atlDate: data.atlDate as string | null,
      atlChangePercentage: data.atlChangePercentage as number | null,
      circulatingSupply: data.circulatingSupply as number | null,
      totalSupply: data.totalSupply as number | null,
      maxSupply: data.maxSupply as number | null,
      maxSupplyInfinite: data.maxSupplyInfinite as boolean | null,
      lastUpdated: data.lastUpdated as string | null,
      sourceUrl: latest.source_url as string,
      observedAt: data.observedAt as string,
      collectedAt: data.collectedAt as string,
    };
  }

  // Build price history from stored candles
  let priceHistory: CryptoPriceHistory | null = null;
  const candleCount = stored?.price_history.candle_count ?? 0;
  if (candleCount > 0) {
    const ph = stored!.price_history;
    priceHistory = {
      provider: "CoinGecko",
      coingeckoId: identity.coingeckoId,
      contractAddress: null,
      network: identity.network,
      vsCurrency: "usd",
      interval: "1d",
      fetchedAt: new Date().toISOString(),
      requested: { from: null, to: null },
      candles: ph.recent.map((c) => ({
        symbol: identity.symbol,
        timestamp: c.timestamp as string,
        open: c.open as number,
        high: c.high as number,
        low: c.low as number,
        close: c.close as number,
        volume: c.volume as number | null,
        quoteCurrency: c.quote_currency as string,
        interval: c.interval as CryptoPriceHistory["interval"],
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

  // Build contracts from stored events
  const contracts = {
    metadata: (stored?.events.contract_metadata ?? []).map((e) => e.data as CryptoContractMetadata),
    analysis: (stored?.events.contract_analysis ?? []).map((e) => e.data as CryptoContractAnalysis),
    supply: (stored?.events.token_supply ?? []).map((e) => e.data as CryptoTokenSupply),
  };

  // Build security from stored events
  let security: CryptoSecurityRecord | null = null;
  const secEvents = stored?.events.security ?? [];
  if (secEvents.length > 0) {
    const firstEvent = secEvents[0];
    if (firstEvent) {
      security = firstEvent.data as CryptoSecurityRecord;
    }
  }

  // Build tokenomics from stored profile
  let tokenomics: CryptoTokenomics | null = null;
  if (stored?.profile?.tokenomics) {
    const t = stored.profile.tokenomics as Record<string, unknown>;
    tokenomics = {
      categories: (t.categories as string[]) ?? [],
      genesisDate: t.genesisDate as string | null,
      hashingAlgorithm: t.hashingAlgorithm as string | null,
      blockTimeMinutes: t.blockTimeMinutes as number | null,
      hasSupplyBreakdown: t.hasSupplyBreakdown as boolean | null,
      circulatingSupply: stored.profile.circulating_supply as number | null,
      totalSupply: stored.profile.total_supply as number | null,
      maxSupply: stored.profile.max_supply as number | null,
      maxSupplyInfinite: null,
    };
  }

  // Build socials from stored profile
  let socials: CryptoSocials | null = null;
  if (stored?.profile?.socials) {
    socials = stored.profile.socials as CryptoSocials;
  }

  return {
    identity,
    profile,
    market,
    priceHistory,
    tokenomics,
    contracts,
    security,
    socials,
    exchanges: [], // TODO: populate from CoinGecko exchanges
    coverage,
    errors: ingestionErrors,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Search/Autocomplete                           */
/* -------------------------------------------------------------------------- */

export async function autocompleteCrypto(query: string, limit = 10): Promise<import("../../types/crypto/crypto.types.js").CryptoSearchCandidate[]> {
  return searchCrypto(query, limit);
}