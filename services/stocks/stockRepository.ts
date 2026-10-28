import "dotenv/config";

import pool from "../../config/database.js";
import type {
  StockIdentity,
  StockProfile,
  StockQuote,
  StockCandle,
  StockHistory,
  FinancialStatements,
  FinancialMetrics,
  InsiderTransaction,
  ThirteenFPeriod,
  BeneficialOwnershipFiling,
  CorporateActionFiling,
} from "../../types/stocks/stock.types.js";
import { createDbClient, type DbClient } from "./stockCoverage.js";
import { buildQuoteSnapshotData, buildQuoteSnapshotKey } from "./fmpStockNormalizer.js";

/* -------------------------------------------------------------------------- */
/*                              Asset Identity                                */
/* -------------------------------------------------------------------------- */

export interface StockAssetRow {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  external_ids: unknown;
  created_at: string;
  updated_at: string;
}

export interface StockAssetUpsertResult {
  asset_id: string;
  created: boolean;
}

/** Builds the provider identifier block for FMP. */
export function buildFmpExternalIds(input: {
  provider_symbol: string;
  provider_name: string | null;
  exchange: string | null;
  cik: string | null;
  isin: string | null;
  cusip: string | null;
}): Record<string, unknown> {
  return {
    symbol: input.provider_symbol,
    name: input.provider_name,
    exchange: input.exchange,
    cik: input.cik,
    isin: input.isin,
    cusip: input.cusip,
  };
}

/** Finds an existing stock asset by ticker or FMP provider symbol. */
export async function findStockAsset(
  client: DbClient,
  ticker: string,
  providerSymbol = ticker,
): Promise<StockAssetRow | null> {
  const result = await client.query(
    `
    SELECT id, symbol, name, asset_type, external_ids, created_at, updated_at
    FROM assets.assets
    WHERE asset_type = 'stock'
      AND (
        lower(symbol) = lower($1)
        OR external_ids->'fmp'->>'symbol' = $2
      )
    ORDER BY created_at
    LIMIT 1
  `,
    [ticker, providerSymbol],
  );

  const row = result.rows[0];
  return row ? (row as unknown as StockAssetRow) : null;
}

/**
 * Inserts or updates the canonical stock asset.
 * Existing symbol and name are never overwritten; only external_ids.fmp is merged.
 */
export async function upsertStockAsset(
  client: DbClient,
  identity: StockIdentity,
  profile: StockProfile | null,
): Promise<StockAssetUpsertResult> {
  const externalIds = buildFmpExternalIds({
    provider_symbol: identity.providerIds.fmp?.symbol as string ?? identity.ticker,
    provider_name: profile?.companyName ?? null,
    exchange: profile?.exchange ?? null,
    cik: profile?.cik ?? identity.cik,
    isin: profile?.isin ?? null,
    cusip: profile?.cusip ?? null,
  });

  // Merge SEC identifiers if present
  if (identity.providerIds.sec) {
    externalIds.sec = identity.providerIds.sec;
  }

  const existing = await findStockAsset(client, identity.ticker, identity.providerIds.fmp?.symbol as string);

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
    VALUES ($1, $2, 'stock', jsonb_build_object('fmp', $3::jsonb))
    RETURNING id
  `,
    [identity.ticker, identity.companyName, JSON.stringify(externalIds)],
  );

  const row = inserted.rows[0];
  const assetId = row?.["id"];
  if (typeof assetId !== "string") {
    throw new Error(`Stock asset insert for ${identity.ticker} returned no id.`);
  }

  return { asset_id: assetId, created: true };
}

/* -------------------------------------------------------------------------- */
/*                              Stock Profile                                 */
/* -------------------------------------------------------------------------- */

/**
 * Upserts assets.stocks with profile data.
 * NULL values never erase existing data (COALESCE).
 */
export async function upsertStockProfile(
  client: DbClient,
  assetId: string,
  profile: StockProfile,
): Promise<void> {
  await client.query(
    `
    INSERT INTO assets.stocks
      (asset_id, exchange, sector, industry, business_summary, financial_statements, financial_metrics)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
    ON CONFLICT (asset_id) DO UPDATE SET
      exchange = COALESCE(EXCLUDED.exchange, assets.stocks.exchange),
      sector = COALESCE(EXCLUDED.sector, assets.stocks.sector),
      industry = COALESCE(EXCLUDED.industry, assets.stocks.industry),
      business_summary = COALESCE(EXCLUDED.business_summary, assets.stocks.business_summary),
      financial_statements = COALESCE(EXCLUDED.financial_statements, assets.stocks.financial_statements),
      financial_metrics = COALESCE(EXCLUDED.financial_metrics, assets.stocks.financial_metrics),
      updated_at = NOW()
  `,
    [
      assetId,
      profile.exchange,
      profile.sector,
      profile.industry,
      profile.description,
      JSON.stringify({ annual: [], quarterly: [] }), // Placeholder; actual statements stored separately
      JSON.stringify({ periods: [] }), // Placeholder; actual metrics stored separately
    ],
  );

  // Note: We store full financial_statements and financial_metrics as JSONB
  // in the same row. The placeholders above are overwritten by the actual
  // upsertFinancialStatements and upsertFinancialMetrics calls.
}

/**
 * Updates only the financial_statements JSONB column.
 */
export async function upsertFinancialStatements(
  client: DbClient,
  assetId: string,
  statements: FinancialStatements,
): Promise<void> {
  await client.query(
    `
    UPDATE assets.stocks
    SET financial_statements = $2::jsonb,
        updated_at = NOW()
    WHERE asset_id = $1
  `,
    [assetId, JSON.stringify(statements)],
  );
}

/**
 * Updates only the financial_metrics JSONB column.
 */
export async function upsertFinancialMetrics(
  client: DbClient,
  assetId: string,
  metrics: FinancialMetrics,
): Promise<void> {
  await client.query(
    `
    UPDATE assets.stocks
    SET financial_metrics = $2::jsonb,
        updated_at = NOW()
    WHERE asset_id = $1
  `,
    [assetId, JSON.stringify(metrics)],
  );
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
export function dedupeCandlesByTimestamp(candles: StockCandle[]): StockCandle[] {
  const byTimestamp = new Map<string, StockCandle>();

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
export async function upsertDailyCandles(
  client: DbClient,
  assetId: string,
  candles: StockCandle[],
  options: { quoteCurrency: string | null } = { quoteCurrency: null },
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

/* -------------------------------------------------------------------------- */
/*                              Quote Snapshots                               */
/* -------------------------------------------------------------------------- */

export interface SnapshotInsertResult {
  inserted: boolean;
  snapshot_key: string;
}

/**
 * Inserts a market_snapshot observation once per provider quote.
 * Deduplication via guarded insert on data->>'snapshot_key'.
 */
export async function insertQuoteSnapshot(
  client: DbClient,
  assetId: string,
  quote: StockQuote,
  sourceUrl: string,
): Promise<SnapshotInsertResult> {
  const data = buildQuoteSnapshotData(quote);
  const snapshotKey = buildQuoteSnapshotKey(quote);

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
    [assetId, JSON.stringify(data), sourceUrl, quote.observedAt, quote.collectedAt, snapshotKey],
  );

  return { inserted: response.rows.length > 0, snapshot_key: snapshotKey };
}

/* -------------------------------------------------------------------------- */
/*                         SEC Event Storage (Generic)                        */
/* -------------------------------------------------------------------------- */

/**
 * Generic function to store SEC-derived events (insider, 13F, 13D/G, corporate actions)
 * in assets.information with appropriate source tags.
 */
export interface SecEventInput {
  assetId: string;
  informationType: "event";
  source: "sec_insider" | "sec_13f" | "sec_13dg" | "sec_corporate_action";
  data: Record<string, unknown>;
  sourceUrl: string;
  observedAt: string | null; // filing date
  collectedAt: string;
  dedupeKey: string; // unique key for this event (e.g., accession number)
}

export interface SecEventInsertResult {
  inserted: boolean;
  dedupeKey: string;
}

/**
 * Inserts an SEC event with idempotency via dedupeKey in the data payload.
 */
export async function insertSecEvent(
  client: DbClient,
  input: SecEventInput,
): Promise<SecEventInsertResult> {
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
/*                              Read-Back                                     */
/* -------------------------------------------------------------------------- */

export interface StockReadback {
  asset: StockAssetRow | null;
  profile: Record<string, unknown> | null;
  price_history: {
    candle_count: number;
    earliest: string | null;
    latest: string | null;
    recent: Array<Record<string, unknown>>;
  };
  snapshots: Array<Record<string, unknown>>;
  sec_events: {
    insider: Array<Record<string, unknown>>;
    institutional: Array<Record<string, unknown>>;
    beneficial_ownership: Array<Record<string, unknown>>;
    corporate_actions: Array<Record<string, unknown>>;
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
 * Reads stored stock state back for verification. Read-only.
 */
export async function readStockState(
  client: DbClient,
  ticker: string,
  options: { recentCandles?: number; recentSnapshots?: number; recentEvents?: number } = {},
): Promise<StockReadback> {
  const asset = await findStockAsset(client, ticker);

  if (!asset) {
    return {
      asset: null,
      profile: null,
      price_history: { candle_count: 0, earliest: null, latest: null, recent: [] },
      snapshots: [],
      sec_events: {
        insider: [],
        institutional: [],
        beneficial_ownership: [],
        corporate_actions: [],
      },
    };
  }

  // Profile
  const profileResult = await client.query(
    `
    SELECT exchange, sector, industry, business_summary, financial_statements, financial_metrics, updated_at
    FROM assets.stocks
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

  const eventLimit = Math.min(Math.max(options.recentEvents ?? 10, 1), 200);
  const [insiderResult, institutionalResult, beneficialResult, corporateResult] = await Promise.all([
    client.query(
      `
      SELECT id, source, source_url, observed_at, collected_at, data
      FROM assets.information
      WHERE asset_id = $1 AND information_type = 'event' AND source = 'sec_insider'
      ORDER BY collected_at DESC
      LIMIT $2
    `,
      [asset.id, eventLimit],
    ),
    client.query(
      `
      SELECT id, source, source_url, observed_at, collected_at, data
      FROM assets.information
      WHERE asset_id = $1 AND information_type = 'event' AND source = 'sec_13f'
      ORDER BY collected_at DESC
      LIMIT $2
    `,
      [asset.id, eventLimit],
    ),
    client.query(
      `
      SELECT id, source, source_url, observed_at, collected_at, data
      FROM assets.information
      WHERE asset_id = $1 AND information_type = 'event' AND source = 'sec_13dg'
      ORDER BY collected_at DESC
      LIMIT $2
    `,
      [asset.id, eventLimit],
    ),
    client.query(
      `
      SELECT id, source, source_url, observed_at, collected_at, data
      FROM assets.information
      WHERE asset_id = $1 AND information_type = 'event' AND source = 'sec_corporate_action'
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
    sec_events: {
      insider: insiderResult.rows.map((row) => ({
        ...row,
        observed_at: toIsoStringOrNull(row["observed_at"]),
        collected_at: toIsoStringOrNull(row["collected_at"]),
      })),
      institutional: institutionalResult.rows.map((row) => ({
        ...row,
        observed_at: toIsoStringOrNull(row["observed_at"]),
        collected_at: toIsoStringOrNull(row["collected_at"]),
      })),
      beneficial_ownership: beneficialResult.rows.map((row) => ({
        ...row,
        observed_at: toIsoStringOrNull(row["observed_at"]),
        collected_at: toIsoStringOrNull(row["collected_at"]),
      })),
      corporate_actions: corporateResult.rows.map((row) => ({
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