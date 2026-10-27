import "dotenv/config";

import type {
  CommodityAssetInput,
  CommodityCandle,
  CommodityQuote,
} from "../../../types/FMP/fmpCommodity.types.js";
import { buildMarketSnapshotData, buildSnapshotKey } from "./fmpCommodityNormalizer.js";

/**
 * Database access for FMP commodity data.
 *
 * Targets:
 *
 *   assets.assets              canonical identity, `asset_type = 'commodity'`
 *   assets.commodities         stable commodity metadata
 *   assets.asset_price_history daily OHLC candles, interval `1d`
 *   assets.information         current quote snapshots, `market_snapshot`
 *
 * Idempotency comes from two places:
 *
 *   - `assets.asset_price_history` has a real `UNIQUE (asset_id, interval,
 *     timestamp)`, so candle upserts are naturally idempotent.
 *   - `assets.assets` has **no** unique constraint on `(symbol, asset_type)`, and
 *     this collector must not alter the schema. Identity is therefore resolved by
 *     a lookup before insert, inside the caller's transaction.
 *
 * Existing asset names and symbols are never overwritten. Provider identifiers are
 * merged into `external_ids.fmp`, preserving any manually verified identity.
 */

export interface DbQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
}

/** Minimal database surface used by this module, so tests can fake it. */
export interface DbClient {
  query(text: string, values?: unknown[]): Promise<DbQueryResult>;
}

interface PgLikeResult {
  rows: unknown[];
  rowCount: number | null;
}

interface PgLike {
  query(text: string, values?: unknown[]): Promise<PgLikeResult>;
}

/** Adapts a `pg` Pool or PoolClient to {@link DbClient}. */
export function createDbClient(pg: PgLike): DbClient {
  return {
    async query(text, values) {
      const result = await pg.query(text, values);
      return {
        rows: result.rows as Array<Record<string, unknown>>,
        rowCount: result.rowCount,
      };
    },
  };
}

// --------------------------------------------------
// Identity
// --------------------------------------------------

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

/** Provider identifier block stored under `external_ids.fmp`. */
export function buildExternalIds(input: CommodityAssetInput): Record<string, unknown> {
  return {
    symbol: input.provider_symbol,
    name: input.provider_name,
    exchange: input.exchange,
    trade_month: input.trade_month,
    currency: input.currency,
  };
}

/** Finds an existing commodity asset by symbol or provider identifier. */
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
 *
 * On an existing row the provider block is merged and `updated_at` is touched;
 * `symbol` and `name` are left untouched so a curated identity is never replaced
 * by provider text.
 */
export async function upsertCommodityAsset(
  client: DbClient,
  input: CommodityAssetInput,
): Promise<CommodityAssetUpsertResult> {
  const externalIds = buildExternalIds(input);
  const existing = await findCommodityAsset(client, input.symbol, input.provider_symbol);

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
    [input.symbol, input.name, JSON.stringify(externalIds)],
  );

  const row = inserted.rows[0];
  const assetId = row?.["id"];
  if (typeof assetId !== "string") {
    throw new Error(`Commodity asset insert for ${input.symbol} returned no id.`);
  }

  return { asset_id: assetId, created: true };
}

// --------------------------------------------------
// Commodity metadata
// --------------------------------------------------

/**
 * Upserts `assets.commodities`.
 *
 * NULL classification never erases an existing value: the curated columns use
 * COALESCE against the current row. `unit_of_measure` is never written because
 * FMP does not report contract size or units.
 */
export async function upsertCommodityProfile(
  client: DbClient,
  assetId: string,
  input: CommodityAssetInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO assets.commodities (asset_id, commodity_type, benchmark, currency)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (asset_id) DO UPDATE SET
        commodity_type = COALESCE(EXCLUDED.commodity_type, assets.commodities.commodity_type),
        benchmark = COALESCE(EXCLUDED.benchmark, assets.commodities.benchmark),
        currency = COALESCE(EXCLUDED.currency, assets.commodities.currency),
        updated_at = NOW()
    `,
    [assetId, input.commodity_type, input.benchmark, input.currency],
  );
}

// --------------------------------------------------
// Price history
// --------------------------------------------------

export interface CandleUpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
}

const CANDLE_BATCH_SIZE = 200;

/** Deduplicates candles by timestamp, keeping the last occurrence. */
export function dedupeCandlesByTimestamp(candles: CommodityCandle[]): CommodityCandle[] {
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
 * Upserts daily candles into `assets.asset_price_history`.
 *
 * Uses the existing `UNIQUE (asset_id, interval, timestamp)` key so repeated runs
 * update in place instead of duplicating. Values are provider-reported; missing
 * volume is written as NULL rather than zero.
 */
export async function upsertDailyCandles(
  client: DbClient,
  assetId: string,
  candles: CommodityCandle[],
  options: { quoteCurrency: string | null },
): Promise<CandleUpsertResult> {
  const unique = dedupeCandlesByTimestamp(candles);
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

// --------------------------------------------------
// Quote snapshots
// --------------------------------------------------

export interface SnapshotInsertResult {
  inserted: boolean;
  snapshot_key: string;
}

/**
 * Inserts a `market_snapshot` observation once per provider quote.
 *
 * `assets.information` has no unique key, so deduplication is done with a guarded
 * insert keyed on `data->>'snapshot_key'` (provider + symbol + quote timestamp).
 * Re-running the same observation is a no-op instead of an extra row.
 */
export async function insertMarketSnapshot(
  client: DbClient,
  assetId: string,
  quote: CommodityQuote,
  sourceUrl: string,
): Promise<SnapshotInsertResult> {
  const data = buildMarketSnapshotData(quote);
  const snapshotKey = buildSnapshotKey(quote);

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
          AND data->>'snapshot_key' = $6
      )
      RETURNING id
    `,
    [assetId, JSON.stringify(data), sourceUrl, quote.observed_at, quote.collected_at, snapshotKey],
  );

  return { inserted: response.rows.length > 0, snapshot_key: snapshotKey };
}

// --------------------------------------------------
// Read-back
// --------------------------------------------------

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

/** `pg` returns `timestamptz` as a Date; read-back normalizes to ISO strings. */
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
 * Reads stored commodity state back for verification.
 *
 * Read-only. NUMERIC columns arrive as strings from `pg` and are converted to
 * numbers for display; nothing is written.
 */
export async function readCommodityState(
  client: DbClient,
  symbol: string,
  options: { recentCandles?: number; recentSnapshots?: number } = {},
): Promise<CommodityReadback> {
  const asset = await findCommodityAsset(client, symbol);

  if (asset === null) {
    return {
      asset: null,
      profile: null,
      price_history: { candle_count: 0, earliest: null, latest: null, recent: [] },
      snapshots: [],
    };
  }

  const profileResult = await client.query(
    `
      SELECT asset_id, commodity_type, benchmark, currency, unit_of_measure,
             uses, value_drivers, supply_demand, inflation_data, updated_at
      FROM assets.commodities
      WHERE asset_id = $1
    `,
    [asset.id],
  );

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
