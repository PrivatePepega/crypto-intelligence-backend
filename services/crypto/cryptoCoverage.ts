import "dotenv/config";

import pool from "../../config/database.js";
import type {
  CryptoDatasetCoverage,
  CryptoCoverageReport,
  CryptoIdentity,
  CryptoDatasetName,
} from "../../types/crypto/crypto.types.js";

/* -------------------------------------------------------------------------- */
/*                              DB Client Adapter                             */
/* -------------------------------------------------------------------------- */

export interface DbClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

export function createDbClient(): DbClient {
  return {
    async query(text: string, values?: unknown[]) {
      const result = await pool.query(text, values);
      return {
        rows: result.rows as Array<Record<string, unknown>>,
        rowCount: result.rowCount,
      };
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                           Coverage Queries                                 */
/* -------------------------------------------------------------------------- */

interface CoverageRow {
  dataset: string;
  last_collected_at: string | null;
  last_successful_at: string | null;
  latest_source_date: string | null;
  record_count: number;
  error_message: string | null;
}

/** Safely gets the first row from a query result, or returns null. */
function getRow<T extends Record<string, unknown>>(result: { rows: T[]; rowCount: number | null }): T | null {
  return result.rows[0] ?? null;
}

/**
 * Checks coverage for a single dataset.
 * This reads from actual database tables, not from collector artifacts.
 */
async function checkDatasetCoverage(
  client: DbClient,
  assetId: string,
  dataset: CryptoDatasetName,
): Promise<CryptoDatasetCoverage> {
  switch (dataset) {
    case "directory": {
      // Directory is a special case - it's global, not per-asset
      return {
        dataset,
        status: "fresh",
        lastCollectedAt: null,
        lastSuccessfulAt: null,
        latestSourceDate: null,
        freshnessPolicy: "Sync via catalog synchronization job (24h TTL).",
        recordCount: 0,
        error: null,
      };
    }

    case "profile": {
      const result = await client.query(
        `
        SELECT 
          c.updated_at AS last_collected_at,
          c.updated_at AS last_successful_at,
          NULL AS latest_source_date,
          1 AS record_count,
          NULL AS error_message
        FROM assets.crypto c
        JOIN assets.assets a ON a.id = c.asset_id
        WHERE a.id = $1
        `,
        [assetId],
      );

      if (result.rows.length === 0) {
        return {
          dataset,
          status: "missing",
          lastCollectedAt: null,
          lastSuccessfulAt: null,
          latestSourceDate: null,
          freshnessPolicy: "Refresh after 7 days, or when missing.",
          recordCount: 0,
          error: null,
        };
      }

      const row = result.rows[0]!;
      if (!row) {
        return {
          dataset,
          status: "missing",
          lastCollectedAt: null,
          lastSuccessfulAt: null,
          latestSourceDate: null,
          freshnessPolicy: "Refresh after 7 days, or when missing.",
          recordCount: 0,
          error: null,
        };
      }
      const lastCollected = row.last_collected_at as string | null;
      const isFresh = lastCollected ? isWithinDays(lastCollected, 7) : false;

      return {
        dataset,
        status: isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: null,
        freshnessPolicy: "Refresh after 7 days, or when missing. Preserve verified fields.",
        recordCount: Number(row.record_count ?? 1),
        error: row.error_message as string | null,
      };
    }

    case "market_snapshot": {
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'observedAt') AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'market_snapshot'
          AND i.source = 'CoinGecko'
        `,
        [assetId],
      );

      const row = result.rows[0]!;
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      // Market snapshot refreshed on every explicit retrieval
      const isFresh = lastCollected ? isSameDay(lastCollected, new Date().toISOString()) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Refresh on every explicit full asset retrieval.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "price_history": {
      const result = await client.query(
        `
        SELECT 
          MAX(h.created_at) AS last_collected_at,
          MAX(h.created_at) AS last_successful_at,
          MAX(h.timestamp) AS latest_source_date,
          MIN(h.timestamp) AS earliest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.asset_price_history h
        WHERE h.asset_id = $1 AND h.interval = '1d'
        `,
        [assetId],
      );

      const row = result.rows[0]!;
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const latestCandle = row.latest_source_date as string | null;
      // History is fresh if we have recent candles and collected recently
      const isFresh = lastCollected && latestCandle ? isWithinDays(lastCollected, 2) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: latestCandle,
        freshnessPolicy: "Fetch missing dates and recent corrections; avoid full re-download.",
        recordCount,
        error: row.error_message as string | null,
        coverageMetadata: {
          earliestCandle: row.earliest_source_date as string | null,
          latestCandle,
        },
      };
    }

    case "contract_metadata": {
      // Contract metadata stored in assets.crypto.contract_addresses and assets.information
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'observedAt') AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'event'
          AND i.source = 'Alchemy'
          AND i.data->>'type' = 'contract_metadata'
        `,
        [assetId],
      );

      const row = result.rows[0]!;
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const isFresh = lastCollected ? isWithinDays(lastCollected, 30) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Refresh when missing or stale (~30 days); distinguish immutable from mutable metadata.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "contract_analysis": {
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'retrievedAt') AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'event'
          AND i.source = 'Alchemy'
          AND i.data->>'type' = 'contract_analysis'
        `,
        [assetId],
      );

      const row = result.rows[0]!;
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const isFresh = lastCollected ? isWithinDays(lastCollected, 90) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Cache by chain, address, and bytecode hash. Avoid repeat analysis when bytecode unchanged.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "token_supply": {
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'observedAt') AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'event'
          AND i.source = 'Alchemy'
          AND i.data->>'type' = 'token_supply'
        `,
        [assetId],
      );

      const row = result.rows[0]!;
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const isFresh = lastCollected ? isWithinDays(lastCollected, 1) : false; // 24 hours

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Refresh when stale (~24h); record block/observation time.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "security": {
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'checkedAt') AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'event'
          AND i.source = 'GoPlus'
          AND i.data->>'type' = 'security'
        `,
        [assetId],
      );

      const row = result.rows[0]!;
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const isFresh = lastCollected ? isWithinDays(lastCollected, 1) : false; // 24 hours

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Refresh when stale (~24h) and preserve historical security snapshots.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "transfers": {
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'toBlockNumber') AS latest_source_date,
          MAX(i.data->>'fromBlockNumber') AS earliest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'event'
          AND i.source = 'Alchemy'
          AND i.data->>'type' = 'transfers'
        `,
        [assetId],
      );

      const row = result.rows[0]!;
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const isFresh = lastCollected ? isWithinDays(lastCollected, 7) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Incremental; use checkpoint/range mechanism to avoid rescanning.",
        recordCount,
        error: row.error_message as string | null,
        coverageMetadata: {
          fromBlock: row.earliest_source_date as string | null,
          toBlock: row.latest_source_date as string | null,
        },
      };
    }

    case "balances": {
      // Known-wallet balances are on-demand only
      return {
        dataset,
        status: "unsupported",
        lastCollectedAt: null,
        lastSuccessfulAt: null,
        latestSourceDate: null,
        freshnessPolicy: "On-demand only; collect when wallet is known and feature requested.",
        recordCount: 0,
        error: null,
      };
    }

    case "holder_distribution": {
      // No valid source implemented yet
      return {
        dataset,
        status: "unsupported",
        lastCollectedAt: null,
        lastSuccessfulAt: null,
        latestSourceDate: null,
        freshnessPolicy: "Only when a valid data source is implemented. Do not fabricate from balances/transfers.",
        recordCount: 0,
        error: null,
      };
    }

    default: {
      return {
        dataset,
        status: "missing",
        lastCollectedAt: null,
        lastSuccessfulAt: null,
        latestSourceDate: null,
        freshnessPolicy: "Unknown dataset.",
        recordCount: 0,
        error: `Unknown dataset: ${dataset}`,
      };
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                           Date Helpers                                     */
/* -------------------------------------------------------------------------- */

function isWithinDays(isoDate: string, days: number): boolean {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= days;
}

function isSameDay(isoDate1: string, isoDate2: string): boolean {
  const d1 = new Date(isoDate1);
  const d2 = new Date(isoDate2);
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
}

/* -------------------------------------------------------------------------- */
/*                           Public API                                       */
/* -------------------------------------------------------------------------- */

/**
 * Builds a complete coverage report for a crypto asset.
 */
export async function getCryptoCoverage(
  identity: CryptoIdentity,
): Promise<CryptoCoverageReport> {
  const client = createDbClient();
  const datasets: CryptoDatasetName[] = [
    "directory",
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
  ];

  const coverage = await Promise.all(
    datasets.map((dataset) => checkDatasetCoverage(client, identity.assetId, dataset)),
  );

  const overallFresh = coverage.every((c) => c.status === "fresh" || c.status === "unsupported");

  return {
    assetId: identity.assetId,
    symbol: identity.symbol,
    datasets: coverage,
    overallFresh,
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Checks if a specific dataset needs refresh.
 */
export async function needsCryptoRefresh(
  identity: CryptoIdentity,
  dataset: CryptoDatasetName,
  forceRefresh = false,
): Promise<{ needed: boolean; reason: string }> {
  if (forceRefresh) {
    return { needed: true, reason: "Forced refresh requested." };
  }

  const coverage = await getCryptoCoverage(identity);
  const datasetCoverage = coverage.datasets.find((d) => d.dataset === dataset);

  if (!datasetCoverage) {
    return { needed: true, reason: "Dataset not in coverage report." };
  }

  if (datasetCoverage.status === "unsupported") {
    return { needed: false, reason: "Dataset is not supported by any collector." };
  }

  if (datasetCoverage.status === "missing") {
    return { needed: true, reason: "Dataset is missing." };
  }

  if (datasetCoverage.status === "stale") {
    return { needed: true, reason: `Dataset is stale (last collected: ${datasetCoverage.lastCollectedAt}).` };
  }

  if (datasetCoverage.status === "failed") {
    return { needed: true, reason: `Last attempt failed: ${datasetCoverage.error}` };
  }

  return { needed: false, reason: "Dataset is fresh." };
}