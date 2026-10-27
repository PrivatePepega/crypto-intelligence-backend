import "dotenv/config";

import pool from "../../config/database.js";
import type {
  CommodityIdentity,
  CommodityProfile,
  CommodityMarketSnapshot,
  CommodityPriceHistory,
  CommodityCandle,
} from "../../types/commodities/commodity.types.js";
import { createDbClient, type DbClient } from "./commodityCoverage.js";
import { buildCommoditySnapshotKey, buildCommoditySnapshotData } from "./commodityNormalizers.js";

/* -------------------------------------------------------------------------- */
/*                              Asset Identity                                */
/* -------------------------------------------------------------------------- */

export interface CommodityAssetRow {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  external_ids: unknown;
  created_at: string;
  updated_at: string;
}

export interface CommodityAssetUpsertResult {
  asset_id: string;
  created: boolean;
}

/** Builds the provider identifier block for FMP. */
export function buildCommodityExternalIds(input: {
  provider_symbol: string;
  provider_name: string | null;
  exchange: string | null;
  trade_month: string | null;
  currency: string | null;
}): Record<string, unknown> {
  return {
    symbol: input.provider_symbol,
    name: input.provider_name,
    exchange: input.exchange,
    trade_month: input.trade_month,
    currency: input.currency,
  };
}

/** Finds an existing commodity asset by symbol or FMP provider symbol. */
export async function findCommodityAsset(
  client: DbClient,
  symbol: string,
  providerSymbol = symbol,
): Promise<CommodityAssetRow | null> {
  const result = await client.query(
    `
    SELECT id, symbol, name, asset_type, external_ids, created_at, updated_at
    FROM assets.assets
    WHERE asset_type = 'commodity'
      AND (
        lower(symbol) = lower($1)
        OR external_ids->'fmp'->>'symbol' = $2
      )
    ORDER BY created_at
    LIMIT 1
  `,
    [symbol, providerSymbol],
  );

  const row = result.rows[0];
  return row ? (row as unknown as CommodityAssetRow) : null;
}

/**
 * Inserts or updates the canonical commodity asset.
 * Existing symbol and name are never overwritten; only external_ids.fmp is merged.
 */
export async function upsertCommodityAsset(
  client: DbClient,
  identity: CommodityIdentity,
  profile: CommodityProfile | null,
): Promise<CommodityAssetUpsertResult> {
  const externalIds = buildCommodityExternalIds({
    provider_symbol: identity.symbol,
    provider_name: profile?.name ?? null,
    exchange: null,
    trade_month: null,
    currency: identity.currency,
  });

  const existing = await findCommodityAsset(client, identity.symbol, identity.providerIds.fmp?.symbol as string);

  if (existing) {
    await client.query(
      `
      UPDATE assets.assets
      SET external_ids = jsonb_set(
            external_ids,
            '{fmp}',
            COALESCE(external_ids->'fmp', '{}'::jsonb) || $2::jsonb,
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
    VALUES ($1, $2, 'commodity', jsonb_build_object('fmp', $3::jsonb))
    RETURNING id
  `,
    [identity.symbol, identity.name, JSON.stringify(externalIds)],
  );

  const row = inserted.rows[0];
  const assetId = row?.["id"];
  if (typeof assetId !== "string") {
    throw new Error(`Commodity asset insert for ${identity.symbol} returned no id.`);
  }

  return { asset_id: assetId, created: true };
}

/* -------------------------------------------------------------------------- */
/*                              Commodity Profile                             */
/* -------------------------------------------------------------------------- */

/**
 * Upserts assets.commodities with profile data.
 * NULL values never erase existing data (COALESCE).
 */
export async function upsertCommodityProfile(
  client: DbClient,
  assetId: string,
  profile: CommodityProfile,
): Promise<void> {
  await client.query(
    `
    INSERT INTO assets.commodities
      (asset_id, commodity_type, benchmark, currency, unit_of_measure,
       uses, value_drivers, supply_demand, inflation_data)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)
    ON CONFLICT (asset_id) DO UPDATE SET
      commodity_type = COALESCE(EXCLUDED.commodity_type, assets.commodities.commodity_type),
      benchmark = COALESCE(EXCLUDED.benchmark, assets.commodities.benchmark),
      currency = COALESCE(EXCLUDED.currency, assets.commodities.currency),
      unit_of_measure = COALESCE(EXCLUDED.unit_of_measure, assets.commodities.unit_of_measure),
      uses = COALESCE(EXCLUDED.uses, assets.commodities.uses),
      value_drivers = COALESCE(EXCLUDED.value_drivers, assets.commodities.value_drivers),
      supply_demand = COALESCE(EXCLUDED.supply_demand, assets.commodities.supply_demand),
      inflation_data = COALESCE(EXCLUDED.inflation_data, assets.commodities.inflation_data),
      updated_at = NOW()
  `,
    [
      assetId,
      profile.commodityType,
      profile.benchmark,
      profile.currency,
      profile.unitOfMeasure,
      JSON.stringify(profile.uses),
      JSON.stringify(profile.valueDrivers),
      JSON.stringify(profile.supplyDemand),
      JSON.stringify(profile.inflationData),
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
 * Inserts a market_snapshot observation once per provider quote.
 * Deduplication via guarded insert on data->>'snapshotKey'.
 */
export async function insertCommoditySnapshot(
  client: DbClient,
  assetId: string,
  snapshot: CommodityMarketSnapshot,
  sourceUrl: string,
): Promise<SnapshotInsertResult> {
  const data = buildCommoditySnapshotData(snapshot);
  const snapshotKey = buildCommoditySnapshotKey(snapshot);

  const response = await client.query(
    `
    INSERT INTO assets.information
      (asset_id, information_type, data, source, source_url, observed_at, collected_at)
    SELECT $1, 'market_snapshot', $2::jsonb, 'fmp', $3, $4::timestamptz, $5::timestamptz
    WHERE NOT EXISTS (
      SELECT 1
      FROM assets.information
      WHERE asset_id = $1
        AND information_type = 'market_snapshot'
        AND source = 'fmp'
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
export function dedupeCommodityCandles(candles: CommodityCandle[]): CommodityCandle[] {
  const byTimestamp = new Map<string, CommodityCandle>();

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
 * Upserts daily candles into assets.asset_price_history.
 * Uses the existing UNIQUE (asset_id, interval, timestamp) key.
 */
export async function upsertCommodityCandles(
  client: DbClient,
  assetId: string,
  candles: CommodityCandle[],
  options: { quoteCurrency: string | null } = { quoteCurrency: null },
): Promise<CandleUpsertResult> {
  const unique = dedupeCommodityCandles(candles);
  const result: CandleUpsertResult = { inserted: 0, updated: 0, skipped: 0 };

  for (let offset = 0; offset < unique.length; offset += CANDLE_BATCH_SIZE) {
    const batch = unique.slice(offset, offset + CANDLE_BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (const candle of batch) {
      const base = values.length;
      placeholders.push(
        `($${base + 1}, $${base + 2}::timestamptz, '1d', $${base + 3}::numeric, ` +
          `$${base + 4}::numeric, $${base + 5}::numeric, $${base + 6}::numeric, ` +
          `$${base + 7}::numeric, $${base + 8})`,
      );
      values.push(
        assetId,
        candle.timestamp,
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
/*                              Read-Back                                     */
/* -------------------------------------------------------------------------- */

export interface CommodityReadback {
  asset: CommodityAssetRow | null;
  profile: Record<string, unknown> | null;
  price_history: {
    candle_count: number;
    earliest: string | null;
    latest: string | null;
    recent: Array<Record<string, unknown>>;
  };
  snapshots: Array<Record<string, unknown>>;
}

export interface CommodityAssetRow {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  external_ids: unknown;
  created_at: string;
  updated_at: string;
}



/**
 * Reads stored commodity state back for verification. Read-only.
 */
export async function readCommodityState(
  client: DbClient,
  symbol: string,
  options: { recentCandles?: number; recentSnapshots?: number } = {},
): Promise<CommodityReadback> {
  const asset = await findCommodityAsset(client, symbol);

  if (!asset) {
    return {
      asset: null,
      profile: null,
      price_history: { candle_count: 0, earliest: null, latest: null, recent: [] },
      snapshots: [],
    };
  }

  // Profile
  const profileResult = await client.query(
    `
    SELECT commodity_type, benchmark, currency, unit_of_measure,
           uses, value_drivers, supply_demand, inflation_data, updated_at
    FROM assets.commodities
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
    WHERE asset_id = $1 AND information_type = 'market_snapshot' AND source = 'fmp'
    ORDER BY collected_at DESC
    LIMIT $2
  `,
    [asset.id, snapshotLimit],
  );

  const summary = historyResult.rows[0] ?? {};

  return {
    asset,
    profile: profileResult.rows[0] ?? null,
    price_history: {
      candle_count: Number(summary["candle_count"] ?? 0),
      earliest: toIsoStringOrNull(summary["earliest"]),
      latest: toIsoStringOrNull(summary["latest"]),
      recent: recentResult.rows.map((row) => ({
        ...row,
        timestamp: toIsoStringOrNull(row["timestamp"]),
      })),
    },
    snapshots: snapshotResult.rows.map((row) => ({
      ...row,
      observed_at: toIsoStringOrNull(row["observed_at"]),
      collected_at: toIsoStringOrNull(row["collected_at"]),
    })),
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

/* -------------------------------------------------------------------------- */
/*                              Transaction Helper                            */
/* -------------------------------------------------------------------------- */

export async function withTransaction<T>(work: (client: DbClient) => Promise<T>): Promise<T> {
  const connection = await pool.connect();
  const client = createDbClient(connection);

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