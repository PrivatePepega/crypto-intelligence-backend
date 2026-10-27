import "dotenv/config";

import type {
  EiaObservation,
  EiaSeriesDefinition,
  EnergyAssetInput,
  EnergySnapshotInput,
} from "../../../types/EIA/eia.types.js";
import { buildObservationKey, buildObservationSnapshotData } from "./eiaNormalizer.js";

/**
 * Database access for EIA energy observations.
 *
 * Targets:
 *
 *   assets.assets               canonical benchmark identity, `asset_type = 'commodity'`
 *   assets.commodities          stable benchmark metadata
 *   assets.series_observations  scalar daily/weekly/monthly observations
 *   assets.information          latest observation per series
 *
 * `assets.asset_price_history` is deliberately **never** written here. It exists
 * for genuine OHLC candles; an EIA scalar value is not a candle. See
 * `database/sql/assets/02-series-observations.sql`.
 *
 * Idempotency:
 *
 *   - `assets.series_observations` has a real unique key
 *     `(provider, series_id, frequency, period)`.
 *   - `assets.assets` has no unique constraint on `(symbol, asset_type)`, so
 *     identity is resolved by lookup before insert, inside the caller's
 *     transaction.
 *   - `assets.information` has no unique key; snapshots use a guarded insert on
 *     `data->>'snapshot_key'`.
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
// Asset identity
// --------------------------------------------------

export interface EnergyAssetRow {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  external_ids: unknown;
  created_at: string;
  updated_at: string;
}

export interface EnergyAssetUpsertResult {
  asset_id: string;
  created: boolean;
}

export function buildEnergyExternalIds(input: EnergyAssetInput): Record<string, unknown> {
  return {
    series: input.provider_series,
    route: input.provider_route,
    frequency: input.provider_frequency,
    unit: input.provider_unit,
    title: input.provider_title,
  };
}

/** Finds an existing commodity asset by symbol or EIA series id. */
export async function findEnergyAsset(
  client: DbClient,
  symbol: string,
  providerSeries = symbol,
): Promise<EnergyAssetRow | null> {
  const result = await client.query(
    `
      SELECT id, symbol, name, asset_type, external_ids, created_at, updated_at
      FROM assets.assets
      WHERE asset_type = 'commodity'
        AND (
          lower(symbol) = lower($1)
          OR external_ids->'eia'->>'series' = $2
        )
      ORDER BY created_at
      LIMIT 1
    `,
    [symbol, providerSeries],
  );

  const row = result.rows[0];
  return row ? (row as unknown as EnergyAssetRow) : null;
}

/**
 * Inserts or updates the canonical benchmark asset.
 *
 * Existing `symbol` and `name` are never overwritten; only `external_ids.eia` is
 * merged, so a curated identity survives re-runs.
 */
export async function upsertEnergyAsset(
  client: DbClient,
  input: EnergyAssetInput,
): Promise<EnergyAssetUpsertResult> {
  const externalIds = buildEnergyExternalIds(input);
  const existing = await findEnergyAsset(client, input.symbol, input.provider_series);

  if (existing) {
    await client.query(
      `
        UPDATE assets.assets
        SET external_ids = jsonb_set(
              external_ids,
              '{eia}',
              COALESCE(external_ids->'eia', '{}'::jsonb) || $2::jsonb,
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
      VALUES ($1, $2, 'commodity', jsonb_build_object('eia', $3::jsonb))
      RETURNING id
    `,
    [input.symbol, input.name, JSON.stringify(externalIds)],
  );

  const row = inserted.rows[0];
  const assetId = row?.["id"];
  if (typeof assetId !== "string") {
    throw new Error(`Energy asset insert for ${input.symbol} returned no id.`);
  }

  return { asset_id: assetId, created: true };
}

/**
 * Upserts `assets.commodities`.
 *
 * NULL metadata never erases a stored value (COALESCE), so an uncurated series
 * cannot wipe curated classification.
 */
export async function upsertCommodityProfile(
  client: DbClient,
  assetId: string,
  input: EnergyAssetInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO assets.commodities
        (asset_id, commodity_type, benchmark, currency, unit_of_measure, value_drivers)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '{}'::jsonb))
      ON CONFLICT (asset_id) DO UPDATE SET
        commodity_type = COALESCE(EXCLUDED.commodity_type, assets.commodities.commodity_type),
        benchmark = COALESCE(EXCLUDED.benchmark, assets.commodities.benchmark),
        currency = COALESCE(EXCLUDED.currency, assets.commodities.currency),
        unit_of_measure = COALESCE(EXCLUDED.unit_of_measure, assets.commodities.unit_of_measure),
        value_drivers = COALESCE($6::jsonb, assets.commodities.value_drivers),
        updated_at = NOW()
    `,
    [
      assetId,
      input.commodity_type,
      input.benchmark,
      input.currency,
      input.unit_of_measure,
      input.value_drivers === null ? null : JSON.stringify(input.value_drivers),
    ],
  );
}

// --------------------------------------------------
// Observations
// --------------------------------------------------

export interface ObservationUpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
}

const OBSERVATION_BATCH_SIZE = 200;

/** Deduplicates observations by period, keeping the last occurrence. */
export function dedupeObservations(observations: EiaObservation[]): EiaObservation[] {
  const byKey = new Map<string, EiaObservation>();

  for (const observation of observations) {
    if (!Number.isFinite(observation.value)) {
      continue;
    }
    byKey.set(buildObservationKey(observation), observation);
  }

  return [...byKey.values()].sort((left, right) => left.period.localeCompare(right.period));
}

/**
 * Upserts scalar observations into `assets.series_observations`.
 *
 * Uses the table's unique key, so re-collecting the same period updates in place.
 * A missing value is rejected before this point and is never written as `0`.
 */
export async function upsertSeriesObservations(
  client: DbClient,
  observations: EiaObservation[],
  meta: { definition: EiaSeriesDefinition; source: "eia"; sourceUrl: string | null },
): Promise<ObservationUpsertResult> {
  const unique = dedupeObservations(observations);
  const result: ObservationUpsertResult = { inserted: 0, updated: 0, skipped: 0 };

  for (let offset = 0; offset < unique.length; offset += OBSERVATION_BATCH_SIZE) {
    const batch = unique.slice(offset, offset + OBSERVATION_BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (const observation of batch) {
      const base = values.length;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::numeric, ` +
          `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
      );
      values.push(
        observation.provider,
        observation.series_id,
        observation.frequency,
        observation.period,
        observation.value,
        observation.unit,
        observation.series_name,
        meta.source,
        meta.sourceUrl,
      );
    }

    const response = await client.query(
      `
        INSERT INTO assets.series_observations
          (provider, series_id, frequency, period, value, unit, series_name, source, source_url)
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (provider, series_id, frequency, period) DO UPDATE SET
          value = EXCLUDED.value,
          unit = COALESCE(EXCLUDED.unit, assets.series_observations.unit),
          series_name = COALESCE(EXCLUDED.series_name, assets.series_observations.series_name),
          source_url = COALESCE(EXCLUDED.source_url, assets.series_observations.source_url),
          updated_at = NOW()
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
// Latest snapshot
// --------------------------------------------------

export interface SnapshotInsertResult {
  inserted: boolean;
  snapshot_key: string;
}

/**
 * Inserts the latest observation for a series into `assets.information`.
 *
 * `information_type` is `market_snapshot` for prices and `macro_context` for
 * supply/demand statistics. `asset_id` is NULL for market-wide statistics.
 */
export async function insertLatestSnapshot(
  client: DbClient,
  input: EnergySnapshotInput,
): Promise<SnapshotInsertResult> {
  const data = buildObservationSnapshotData(input.definition, input.observation);
  const snapshotKey = data["snapshot_key"];
  if (typeof snapshotKey !== "string") {
    throw new Error("Snapshot key could not be built.");
  }

  const response = await client.query(
    `
      INSERT INTO assets.information
        (asset_id, information_type, data, source, source_url, observed_at, collected_at)
      SELECT $1, $2, $3::jsonb, 'eia', $4, NULL, $5::timestamptz
      WHERE NOT EXISTS (
        SELECT 1
        FROM assets.information
        WHERE information_type = $2
          AND source = 'eia'
          AND data->>'snapshot_key' = $6
      )
      RETURNING id
    `,
    [
      input.asset_id,
      input.information_type,
      JSON.stringify(data),
      input.source_url,
      input.observation.collected_at,
      snapshotKey,
    ],
  );

  return { inserted: response.rows.length > 0, snapshot_key: snapshotKey };
}

// --------------------------------------------------
// Read-back
// --------------------------------------------------

export interface SeriesReadback {
  series_id: string;
  asset: EnergyAssetRow | null;
  observation_count: number;
  earliest_period: string | null;
  latest_period: string | null;
  recent: Array<Record<string, unknown>>;
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
 * Reads stored state back for verification. Read-only.
 */
export async function readEnergyState(
  client: DbClient,
  seriesIds: string[],
  options: { recentObservations?: number; recentSnapshots?: number } = {},
): Promise<SeriesReadback[]> {
  const recentLimit = Math.min(Math.max(options.recentObservations ?? 5, 1), 200);
  const snapshotLimit = Math.min(Math.max(options.recentSnapshots ?? 2, 1), 50);
  const readback: SeriesReadback[] = [];

  for (const seriesId of seriesIds) {
    const asset = await findEnergyAsset(client, seriesId);

    const summary = await client.query(
      `
        SELECT COUNT(*)::int AS observation_count,
               MIN(period) AS earliest_period,
               MAX(period) AS latest_period
        FROM assets.series_observations
        WHERE provider = 'eia' AND series_id = $1
      `,
      [seriesId],
    );

    const recent = await client.query(
      `
        SELECT series_id, frequency, period, value, unit, series_name,
               source, observed_at, collected_at, updated_at
        FROM assets.series_observations
        WHERE provider = 'eia' AND series_id = $1
        ORDER BY period DESC
        LIMIT $2
      `,
      [seriesId, recentLimit],
    );

    const snapshots = await client.query(
      `
        SELECT id, asset_id, information_type, source, source_url,
               observed_at, collected_at, data
        FROM assets.information
        WHERE source = 'eia'
          AND information_type IN ('market_snapshot', 'macro_context')
          AND data->>'series_id' = $1
        ORDER BY collected_at DESC
        LIMIT $2
      `,
      [seriesId, snapshotLimit],
    );

    const stats = summary.rows[0] ?? {};

    readback.push({
      series_id: seriesId,
      asset,
      observation_count: Number(stats["observation_count"] ?? 0),
      earliest_period:
        typeof stats["earliest_period"] === "string" ? stats["earliest_period"] : null,
      latest_period: typeof stats["latest_period"] === "string" ? stats["latest_period"] : null,
      recent: recent.rows.map((row) => ({
        ...row,
        observed_at: toIsoStringOrNull(row["observed_at"]),
        collected_at: toIsoStringOrNull(row["collected_at"]),
        updated_at: toIsoStringOrNull(row["updated_at"]),
      })),
      snapshots: snapshots.rows.map((row) => ({
        ...row,
        observed_at: toIsoStringOrNull(row["observed_at"]),
        collected_at: toIsoStringOrNull(row["collected_at"]),
      })),
    });
  }

  return readback;
}
