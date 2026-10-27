import "dotenv/config";

import pool from "../../config/database.js";
import type {
  CryptoIdentity,
  CryptoProfile,
  CryptoMarketSnapshot,
  CryptoPriceHistory,
  CryptoCandle,
  CryptoContractMetadata,
  CryptoContractAnalysis,
  CryptoTokenSupply,
  CryptoSecurityRecord,
  CryptoSecuritySnapshot,
} from "../../types/crypto/crypto.types.js";
import { createDbClient, type DbClient } from "./cryptoCoverage.js";

/* -------------------------------------------------------------------------- */
/*                              Asset Identity                                */
/* -------------------------------------------------------------------------- */

export interface CryptoAssetRow {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  external_ids: unknown;
  created_at: string;
  updated_at: string;
}

export interface CryptoAssetUpsertResult {
  asset_id: string;
  created: boolean;
}

/** Builds the provider identifier block for CoinGecko. */
export function buildCoingeckoExternalIds(input: {
  provider_id: string;
  provider_name: string | null;
  provider_symbol: string | null;
  network: string | null;
}): Record<string, unknown> {
  return {
    id: input.provider_id,
    name: input.provider_name,
    symbol: input.provider_symbol,
    network: input.network,
  };
}

/** Finds an existing crypto asset by symbol or CoinGecko provider ID. */
export async function findCryptoAsset(
  client: DbClient,
  symbol: string,
  coingeckoId: string | null,
): Promise<CryptoAssetRow | null> {
  const conditions = ["a.asset_type = 'crypto'"];
  const values: unknown[] = [];

  if (coingeckoId) {
    conditions.push("(a.external_ids->'coingecko'->>'id' = $1 OR lower(a.symbol) = lower($2))");
    values.push(coingeckoId, symbol);
  } else {
    conditions.push("lower(a.symbol) = lower($1)");
    values.push(symbol);
  }

  const result = await client.query(
    `
    SELECT a.id, a.symbol, a.name, a.asset_type, a.external_ids, a.created_at, a.updated_at
    FROM assets.assets a
    WHERE ${conditions.join(" OR ")}
    ORDER BY a.created_at
    LIMIT 1
  `,
    values,
  );

  const row = result.rows[0];
  return row ? (row as unknown as CryptoAssetRow) : null;
}

/**
 * Inserts or updates the canonical crypto asset.
 * Existing symbol and name are never overwritten; only external_ids.coingecko is merged.
 */
export async function upsertCryptoAsset(
  client: DbClient,
  identity: CryptoIdentity,
  profile: CryptoProfile | null,
): Promise<CryptoAssetUpsertResult> {
  const externalIds = buildCoingeckoExternalIds({
    provider_id: identity.coingeckoId ?? "",
    provider_name: profile?.name ?? null,
    provider_symbol: identity.symbol,
    network: identity.network,
  });

  // Merge Alchemy identifiers if present
  if (identity.providerIds.alchemy) {
    externalIds.alchemy = identity.providerIds.alchemy;
  }

  // Merge GoPlus if present
  if (identity.providerIds.goplus) {
    externalIds.goplus = identity.providerIds.goplus;
  }

  const existing = await findCryptoAsset(client, identity.symbol, identity.coingeckoId);

  if (existing) {
    await client.query(
      `
      UPDATE assets.assets
      SET external_ids = jsonb_set(
            external_ids,
            '{coingecko}',
            COALESCE(external_ids->'coingecko', '{}'::jsonb) || $2::jsonb,
            true
          ),
          updated_at = NOW()
      WHERE id = $1
    `,
      [existing.id, JSON.stringify(externalIds)],
    );

    return { asset_id: existing.id, created: false };
  }

  const inserted = await client.query(
    `
    INSERT INTO assets.assets (symbol, name, asset_type, external_ids)
    VALUES ($1, $2, 'crypto', jsonb_build_object('coingecko', $3::jsonb))
    RETURNING id
  `,
    [identity.symbol, identity.name, JSON.stringify(externalIds)],
  );

  const row = inserted.rows[0];
  const assetId = row?.["id"];
  if (typeof assetId !== "string") {
    throw new Error(`Crypto asset insert for ${identity.symbol} returned no id.`);
  }

  return { asset_id: assetId, created: true };
}

/* -------------------------------------------------------------------------- */
/*                              Crypto Profile                                */
/* -------------------------------------------------------------------------- */

/**
 * Upserts assets.crypto with profile data.
 * NULL values never erase existing data (COALESCE).
 */
export async function upsertCryptoProfile(
  client: DbClient,
  assetId: string,
  profile: CryptoProfile,
): Promise<void> {
  // Build contract_addresses array from deployments
  const coingeckoData = profile.providerData.coingecko as {
    crypto?: {
      contractAddresses?: Array<{ network: string; address: string; decimalPlace: number | null; verified: boolean }>;
      circulatingSupply?: number | null;
      totalSupply?: number | null;
      maxSupply?: number | null;
      tokenomics?: { categories?: string[]; hasSupplyBreakdown?: boolean | null };
      socials?: Record<string, unknown>;
    };
  } | null;
  const contractAddresses = Object.values(coingeckoData?.crypto?.contractAddresses ?? []).map(
    (ca) => ({
      network: ca.network,
      address: ca.address,
      decimals: ca.decimalPlace,
      verified: ca.verified,
      source: "CoinGecko",
    }),
  );

  await client.query(
    `
    INSERT INTO assets.crypto
      (asset_id, network, contract_addresses, circulating_supply, total_supply, max_supply,
       tokenomics, holder_distribution, contract_analysis, socials, exchanges, security_summary)
    VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12)
    ON CONFLICT (asset_id) DO UPDATE SET
      network = COALESCE(EXCLUDED.network, assets.crypto.network),
      contract_addresses = COALESCE(EXCLUDED.contract_addresses, assets.crypto.contract_addresses),
      circulating_supply = COALESCE(EXCLUDED.circulating_supply, assets.crypto.circulating_supply),
      total_supply = COALESCE(EXCLUDED.total_supply, assets.crypto.total_supply),
      max_supply = COALESCE(EXCLUDED.max_supply, assets.crypto.max_supply),
      tokenomics = COALESCE(EXCLUDED.tokenomics, assets.crypto.tokenomics),
      holder_distribution = COALESCE(EXCLUDED.holder_distribution, assets.crypto.holder_distribution),
      contract_analysis = COALESCE(EXCLUDED.contract_analysis, assets.crypto.contract_analysis),
      socials = COALESCE(EXCLUDED.socials, assets.crypto.socials),
      exchanges = COALESCE(EXCLUDED.exchanges, assets.crypto.exchanges),
      security_summary = COALESCE(EXCLUDED.security_summary, assets.crypto.security_summary),
      updated_at = NOW()
  `,
    [
      assetId,
      profile.network,
      JSON.stringify(contractAddresses),
      coingeckoData?.crypto?.circulatingSupply ?? null,
      coingeckoData?.crypto?.totalSupply ?? null,
      coingeckoData?.crypto?.maxSupply ?? null,
      JSON.stringify({
        categories: coingeckoData?.crypto?.tokenomics?.categories ?? [],
        genesisDate: profile.genesisDate,
        hashingAlgorithm: profile.hashingAlgorithm,
        blockTimeMinutes: profile.blockTimeMinutes,
        hasSupplyBreakdown: coingeckoData?.crypto?.tokenomics?.hasSupplyBreakdown ?? null,
      }),
      JSON.stringify({}), // holder_distribution - populated separately
      JSON.stringify({}), // contract_analysis - populated separately
      JSON.stringify(coingeckoData?.crypto?.socials ?? {}),
      JSON.stringify([]), // exchanges - populated separately
      null, // security_summary - populated separately
    ],
  );
}

/* -------------------------------------------------------------------------- */
/*                              Market Snapshot                               */
/* -------------------------------------------------------------------------- */

export interface SnapshotInsertResult {
  inserted: boolean;
  snapshot_key: string;
}

/**
 * Builds a stable key for idempotent market snapshots.
 * Key format: coingecko:<coingeckoId>:<observedAt>
 */
export function buildCryptoSnapshotKey(snapshot: CryptoMarketSnapshot): string {
  return `coingecko:${snapshot.coingeckoId}:${snapshot.observedAt}`;
}

/**
 * Builds the assets.information.data payload for a market snapshot observation.
 */
export function buildCryptoSnapshotData(snapshot: CryptoMarketSnapshot): Record<string, unknown> {
  return {
    provider: snapshot.provider,
    coingeckoId: snapshot.coingeckoId,
    vsCurrency: snapshot.vsCurrency,
    currentPrice: snapshot.currentPrice,
    marketCap: snapshot.marketCap,
    fullyDilutedValuation: snapshot.fullyDilutedValuation,
    marketCapRank: snapshot.marketCapRank,
    totalVolume: snapshot.totalVolume,
    totalValueLocked: snapshot.totalValueLocked,
    high24h: snapshot.high24h,
    low24h: snapshot.low24h,
    priceChange24h: snapshot.priceChange24h,
    priceChangePercentage24h: snapshot.priceChangePercentage24h,
    priceChangePercentage7d: snapshot.priceChangePercentage7d,
    priceChangePercentage30d: snapshot.priceChangePercentage30d,
    marketCapChange24h: snapshot.marketCapChange24h,
    marketCapChangePercentage24h: snapshot.marketCapChangePercentage24h,
    ath: snapshot.ath,
    athDate: snapshot.athDate,
    athChangePercentage: snapshot.athChangePercentage,
    atl: snapshot.atl,
    atlDate: snapshot.atlDate,
    atlChangePercentage: snapshot.atlChangePercentage,
    circulatingSupply: snapshot.circulatingSupply,
    totalSupply: snapshot.totalSupply,
    maxSupply: snapshot.maxSupply,
    maxSupplyInfinite: snapshot.maxSupplyInfinite,
    lastUpdated: snapshot.lastUpdated,
    observedAt: snapshot.observedAt,
    collectedAt: snapshot.collectedAt,
    snapshotKey: buildCryptoSnapshotKey(snapshot),
    limitations: [
      "Provider-reported snapshot; not independently verified.",
      "Volume is the provider's reported volume with no documented unit.",
      "A snapshot is an observation, not a daily candle.",
    ],
  };
}

/**
 * Inserts a market_snapshot observation once per provider quote.
 * Deduplication via guarded insert on data->>'snapshotKey'.
 */
export async function insertCryptoSnapshot(
  client: DbClient,
  assetId: string,
  snapshot: CryptoMarketSnapshot,
  sourceUrl: string,
): Promise<SnapshotInsertResult> {
  const data = buildCryptoSnapshotData(snapshot);
  const snapshotKey = buildCryptoSnapshotKey(snapshot);

  const response = await client.query(
    `
    INSERT INTO assets.information
      (asset_id, information_type, data, source, source_url, observed_at, collected_at)
    SELECT $1, 'market_snapshot', $2::jsonb, 'CoinGecko', $3, $4::timestamptz, $5::timestamptz
    WHERE NOT EXISTS (
      SELECT 1
      FROM assets.information
      WHERE asset_id = $1
        AND information_type = 'market_snapshot'
        AND source = 'CoinGecko'
        AND data->>'snapshotKey' = $6
    )
    RETURNING id
  `,
    [assetId, JSON.stringify(data), sourceUrl, snapshot.observedAt, snapshot.collectedAt, snapshotKey],
  );

  return { inserted: response.rows.length > 0, snapshot_key: snapshotKey };
}

/* -------------------------------------------------------------------------- */
/*                              Price History                                 */
/* -------------------------------------------------------------------------- */

export interface CandleUpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
}

const CANDLE_BATCH_SIZE = 200;

/** Deduplicates candles by timestamp, keeping the last occurrence. */
export function dedupeCryptoCandles(candles: CryptoCandle[]): CryptoCandle[] {
  const byTimestamp = new Map<string, CryptoCandle>();

  for (const candle of candles) {
    const timestamp = candle.timestamp;
    if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
      continue;
    }
    byTimestamp.set(timestamp, candle);
  }

  return [...byTimestamp.values()].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
}

/**
 * Upserts candles into assets.asset_price_history.
 * Uses the existing UNIQUE (asset_id, interval, timestamp) key.
 */
export async function upsertCryptoCandles(
  client: DbClient,
  assetId: string,
  candles: CryptoCandle[],
  options: { quoteCurrency: string | null } = { quoteCurrency: null },
): Promise<CandleUpsertResult> {
  const unique = dedupeCryptoCandles(candles);
  const result: CandleUpsertResult = { inserted: 0, updated: 0, skipped: 0 };

  for (let offset = 0; offset < unique.length; offset += CANDLE_BATCH_SIZE) {
    const batch = unique.slice(offset, offset + CANDLE_BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (const candle of batch) {
      const base = values.length;
      placeholders.push(
        `($${base + 1}, $${base + 2}::timestamptz, $${base + 3}, $${base + 4}::numeric, ` +
          `$${base + 5}::numeric, $${base + 6}::numeric, $${base + 7}::numeric, ` +
          `$${base + 8}::numeric, $${base + 9})`,
      );
      values.push(
        assetId,
        candle.timestamp,
        candle.interval,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
        options.quoteCurrency,
      );
    }

    const response = await client.query(
      `
      INSERT INTO assets.asset_price_history
        (asset_id, "timestamp", interval, open, high, low, close, volume, quote_currency)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (asset_id, interval, "timestamp") DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        quote_currency = COALESCE(EXCLUDED.quote_currency, assets.asset_price_history.quote_currency)
      RETURNING (xmax = 0) AS inserted
    `,
      values,
    );

    for (const row of response.rows) {
      if (row["inserted"] === true) {
        result.inserted += 1;
      } else {
        result.updated += 1;
      }
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/*                         Generic SEC-style Events                           */
/* -------------------------------------------------------------------------- */

/**
 * Generic function to store crypto events (contract_metadata, contract_analysis,
 * token_supply, security, transfers) in assets.information with appropriate source tags.
 */
export interface CryptoEventInput {
  assetId: string;
  informationType: "event";
  source: "Alchemy" | "GoPlus";
  data: Record<string, unknown>;
  sourceUrl: string;
  observedAt: string | null; // observation/filing date
  collectedAt: string;
  dedupeKey: string; // unique key for this event
}

export interface CryptoEventInsertResult {
  inserted: boolean;
  dedupeKey: string;
}

/**
 * Inserts a crypto event with idempotency via dedupeKey in the data payload.
 */
export async function insertCryptoEvent(
  client: DbClient,
  input: CryptoEventInput,
): Promise<CryptoEventInsertResult> {
  const dataWithKey = { ...input.data, dedupe_key: input.dedupeKey };

  const response = await client.query(
    `
    INSERT INTO assets.information
      (asset_id, information_type, data, source, source_url, observed_at, collected_at)
    SELECT $1, $2, $3::jsonb, $4, $5, $6::timestamptz, $7::timestamptz
    WHERE NOT EXISTS (
      SELECT 1
      FROM assets.information
      WHERE asset_id = $1
        AND information_type = $2
        AND source = $4
        AND data->>'dedupe_key' = $8
    )
    RETURNING id
  `,
    [
      input.assetId,
      input.informationType,
      JSON.stringify(dataWithKey),
      input.source,
      input.sourceUrl,
      input.observedAt,
      input.collectedAt,
      input.dedupeKey,
    ],
  );

  return { inserted: response.rows.length > 0, dedupeKey: input.dedupeKey };
}

/* -------------------------------------------------------------------------- */
/*                         Specific Event Builders                            */
/* -------------------------------------------------------------------------- */

/** Builds event data for Alchemy contract metadata. */
export function buildContractMetadataEvent(metadata: CryptoContractMetadata): Record<string, unknown> {
  return {
    type: "contract_metadata",
    network: metadata.network,
    chainId: metadata.chainId,
    contractAddress: metadata.contractAddress,
    name: metadata.name,
    symbol: metadata.symbol,
    decimals: metadata.decimals,
    logoUrl: metadata.logoUrl,
    isToken: metadata.isToken,
    explorerUrl: metadata.explorerUrl,
    verified: metadata.verified,
    source: metadata.source,
    observedAt: metadata.observedAt,
  };
}

/** Builds event data for Alchemy contract analysis. */
export function buildContractAnalysisEvent(analysis: CryptoContractAnalysis): Record<string, unknown> {
  return {
    type: "contract_analysis",
    network: analysis.network,
    chainId: analysis.chainId,
    contractAddress: analysis.contractAddress,
    isContract: analysis.isContract,
    bytecodeHash: analysis.bytecodeHash,
    hashAlgorithm: analysis.hashAlgorithm,
    bytecodeBytes: analysis.bytecodeBytes,
    isMinimalProxy: analysis.isMinimalProxy,
    minimalProxyImplementation: analysis.minimalProxyImplementation,
    isProxyLike: analysis.isProxyLike,
    proxyEvidence: analysis.proxyEvidence,
    selectorsPresent: analysis.selectorsPresent,
    selectorsMissing: analysis.selectorsMissing,
    note: analysis.note,
    source: analysis.source,
    retrievedAt: analysis.retrievedAt,
    explorerUrl: analysis.explorerUrl,
  };
}

/** Builds event data for Alchemy token supply. */
export function buildTokenSupplyEvent(supply: CryptoTokenSupply): Record<string, unknown> {
  return {
    type: "token_supply",
    network: supply.network,
    chainId: supply.chainId,
    contractAddress: supply.contractAddress,
    blockTag: supply.blockTag,
    blockNumber: supply.blockNumber,
    callData: supply.callData,
    rawValue: supply.rawValue,
    decimals: supply.decimals,
    decimalsSource: supply.decimalsSource,
    totalSupply: supply.totalSupply,
    note: supply.note,
    source: supply.source,
    observedAt: supply.observedAt,
    explorerUrl: supply.explorerUrl,
  };
}

/** Builds event data for GoPlus security. */
export function buildSecurityEvent(security: CryptoSecurityRecord): Record<string, unknown> {
  return {
    type: "security",
    chainId: security.chainId,
    chainName: security.chainName,
    contractAddress: security.contractAddress,
    tokenName: security.tokenName,
    tokenSymbol: security.tokenSymbol,
    checkedAt: security.checkedAt,
    sourceUrl: security.sourceUrl,
    providerCode: security.providerCode,
    providerMessage: security.providerMessage,
    found: security.found,
    isOpenSource: security.isOpenSource,
    isProxy: security.isProxy,
    isMintable: security.isMintable,
    ownerControls: security.ownerControls,
    permissions: security.permissions,
    taxIndicators: security.taxIndicators,
    trading: security.trading,
    trust: security.trust,
    riskFlags: security.riskFlags,
    missingFields: security.missingFields,
    securitySummary: security.securitySummary,
    limitations: security.limitations,
  };
}

/** Builds event data for Alchemy transfers. */
export function buildTransfersEvent(
  network: string,
  chainId: number,
  contractAddress: string,
  fromBlock: number,
  toBlock: number,
  transferCount: number,
  collectedAt: string,
): Record<string, unknown> {
  return {
    type: "transfers",
    network,
    chainId,
    contractAddress,
    fromBlockNumber: fromBlock,
    toBlockNumber: toBlock,
    transferCount,
    collectedAt,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Read-Back                                     */
/* -------------------------------------------------------------------------- */

export interface CryptoReadback {
  asset: CryptoAssetRow | null;
  profile: Record<string, unknown> | null;
  price_history: {
    candle_count: number;
    earliest: string | null;
    latest: string | null;
    recent: Array<Record<string, unknown>>;
  };
  snapshots: Array<Record<string, unknown>>;
  events: {
    contract_metadata: Array<Record<string, unknown>>;
    contract_analysis: Array<Record<string, unknown>>;
    token_supply: Array<Record<string, unknown>>;
    security: Array<Record<string, unknown>>;
    transfers: Array<Record<string, unknown>>;
  };
}

function toIsoStringOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

/**
 * Reads stored crypto state back for verification. Read-only.
 */
export async function readCryptoState(
  client: DbClient,
  symbol: string,
  options: { recentCandles?: number; recentSnapshots?: number; recentEvents?: number } = {},
): Promise<CryptoReadback> {
  const asset = await findCryptoAsset(client, symbol, null);

  if (!asset) {
    return {
      asset: null,
      profile: null,
      price_history: { candle_count: 0, earliest: null, latest: null, recent: [] },
      snapshots: [],
      events: {
        contract_metadata: [],
        contract_analysis: [],
        token_supply: [],
        security: [],
        transfers: [],
      },
    };
  }

  // Profile
  const profileResult = await client.query(
    `
    SELECT network, contract_addresses, circulating_supply, total_supply, max_supply,
           tokenomics, holder_distribution, contract_analysis, socials, exchanges, security_summary, updated_at
    FROM assets.crypto
    WHERE asset_id = $1
  `,
    [asset.id],
  );

  // Price history summary
  const historyResult = await client.query(
    `
    SELECT COUNT(*)::int AS candle_count,
           MIN("timestamp") AS earliest,
           MAX("timestamp") AS latest
    FROM assets.asset_price_history
    WHERE asset_id = $1 AND interval = '1d'
  `,
    [asset.id],
  );

  const recentCandles = Math.min(Math.max(options.recentCandles ?? 5, 1), 200);
  const recentResult = await client.query(
    `
    SELECT "timestamp", interval, open, high, low, close, volume, quote_currency
    FROM assets.asset_price_history
    WHERE asset_id = $1 AND interval = '1d'
    ORDER BY "timestamp" DESC
    LIMIT $2
  `,
    [asset.id, recentCandles],
  );

  const snapshotLimit = Math.min(Math.max(options.recentSnapshots ?? 3, 1), 50);
  const snapshotResult = await client.query(
    `
    SELECT id, source, source_url, observed_at, collected_at, data
    FROM assets.information
    WHERE asset_id = $1 AND information_type = 'market_snapshot' AND source = 'CoinGecko'
    ORDER BY collected_at DESC
    LIMIT $2
  `,
    [asset.id, snapshotLimit],
  );

  const eventLimit = Math.min(Math.max(options.recentEvents ?? 10, 1), 200);
  const [contractMetadataResult, contractAnalysisResult, tokenSupplyResult, securityResult, transfersResult] =
    await Promise.all([
      client.query(
        `
        SELECT id, source, source_url, observed_at, collected_at, data
        FROM assets.information
        WHERE asset_id = $1 AND information_type = 'event' AND source = 'Alchemy' AND data->>'type' = 'contract_metadata'
        ORDER BY collected_at DESC
        LIMIT $2
      `,
        [asset.id, eventLimit],
      ),
      client.query(
        `
        SELECT id, source, source_url, observed_at, collected_at, data
        FROM assets.information
        WHERE asset_id = $1 AND information_type = 'event' AND source = 'Alchemy' AND data->>'type' = 'contract_analysis'
        ORDER BY collected_at DESC
        LIMIT $2
      `,
        [asset.id, eventLimit],
      ),
      client.query(
        `
        SELECT id, source, source_url, observed_at, collected_at, data
        FROM assets.information
        WHERE asset_id = $1 AND information_type = 'event' AND source = 'Alchemy' AND data->>'type' = 'token_supply'
        ORDER BY collected_at DESC
        LIMIT $2
      `,
        [asset.id, eventLimit],
      ),
      client.query(
        `
        SELECT id, source, source_url, observed_at, collected_at, data
        FROM assets.information
        WHERE asset_id = $1 AND information_type = 'event' AND source = 'GoPlus' AND data->>'type' = 'security'
        ORDER BY collected_at DESC
        LIMIT $2
      `,
        [asset.id, eventLimit],
      ),
      client.query(
        `
        SELECT id, source, source_url, observed_at, collected_at, data
        FROM assets.information
        WHERE asset_id = $1 AND information_type = 'event' AND source = 'Alchemy' AND data->>'type' = 'transfers'
        ORDER BY collected_at DESC
        LIMIT $2
      `,
        [asset.id, eventLimit],
      ),
    ]);

  const summary = historyResult.rows[0] ?? {};

  return {
    asset,
    profile: profileResult.rows[0] ?? null,
    price_history: {
      candle_count: Number(summary["candle_count"] ?? 0),
      earliest: toIsoStringOrNull(summary["earliest"]),
      latest: toIsoStringOrNull(summary["latest"]),
      recent: recentResult.rows.map((row: Record<string, unknown>) => ({
        ...row,
        timestamp: toIsoStringOrNull(row["timestamp"]),
      })),
    },
    snapshots: snapshotResult.rows.map((row: Record<string, unknown>) => ({
      ...row,
      observed_at: toIsoStringOrNull(row["observed_at"]),
      collected_at: toIsoStringOrNull(row["collected_at"]),
    })),
    events: {
      contract_metadata: contractMetadataResult.rows.map((row: Record<string, unknown>) => ({
        ...row,
        observed_at: toIsoStringOrNull(row["observed_at"]),
        collected_at: toIsoStringOrNull(row["collected_at"]),
      })),
      contract_analysis: contractAnalysisResult.rows.map((row: Record<string, unknown>) => ({
        ...row,
        observed_at: toIsoStringOrNull(row["observed_at"]),
        collected_at: toIsoStringOrNull(row["collected_at"]),
      })),
      token_supply: tokenSupplyResult.rows.map((row: Record<string, unknown>) => ({
        ...row,
        observed_at: toIsoStringOrNull(row["observed_at"]),
        collected_at: toIsoStringOrNull(row["collected_at"]),
      })),
      security: securityResult.rows.map((row: Record<string, unknown>) => ({
        ...row,
        observed_at: toIsoStringOrNull(row["observed_at"]),
        collected_at: toIsoStringOrNull(row["collected_at"]),
      })),
      transfers: transfersResult.rows.map((row: Record<string, unknown>) => ({
        ...row,
        observed_at: toIsoStringOrNull(row["observed_at"]),
        collected_at: toIsoStringOrNull(row["collected_at"]),
      })),
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              Transaction Helper                            */
/* -------------------------------------------------------------------------- */

export async function withTransaction<T>(work: (client: DbClient) => Promise<T>): Promise<T> {
  const connection = await pool.connect();
  const client = createDbClient();

  try {
    await connection.query("BEGIN");
    const result = await work(client);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}