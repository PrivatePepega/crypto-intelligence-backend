import "dotenv/config";

import pool from "../../config/database.js";
import type {
  DbClient,
  CommodityDatasetCoverage,
  CommodityCoverageReport,
  CommodityIdentity,
  CommodityDatasetName,
} from "../../types/commodities/commodity.types.js";

/* -------------------------------------------------------------------------- */
/*                              DB Client Adapter                             */
/* -------------------------------------------------------------------------- */

export function createDbClient(pg?: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }): DbClient {
  const client = pg ?? pool;
  return {
    async query(text: string, values?: unknown[]) {
      const result = await client.query(text, values);
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

/**
 * Checks coverage for a single dataset.
 * This reads from actual database tables, not from collector artifacts.
 */
async function checkDatasetCoverage(
  client: DbClient,
  assetId: string,
  dataset: CommodityDatasetName,
): Promise<CommodityDatasetCoverage> {
  switch (dataset) {
    case "profile": {
      const result = await client.query(
        `
        SELECT 
          c.updated_at AS last_collected_at,
          c.updated_at AS last_successful_at,
          NULL AS latest_source_date,
          1 AS record_count,
          NULL AS error_message
        FROM assets.commodities c
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
          freshnessPolicy: "Refresh after 30 days, or when missing.",
          recordCount: 0,
          error: null,
        };
      }

      const row = result.rows[0];
      if (!row) {
        return {
          dataset,
          status: "missing",
          lastCollectedAt: null,
          lastSuccessfulAt: null,
          latestSourceDate: null,
          freshnessPolicy: "Unknown dataset.",
          recordCount: 0,
          error: null,
        };
      }
      if (!row) {
        return {
          dataset,
          status: "missing",
          lastCollectedAt: null,
          lastSuccessfulAt: null,
          latestSourceDate: null,
          freshnessPolicy: "Refresh after 30 days, or when missing.",
          recordCount: 0,
          error: null,
        };
      }
      const lastCollected = row.last_collected_at as string | null;
      const isFresh = lastCollected ? isWithinDays(lastCollected, 30) : false;

      return {
        dataset,
        status: isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: null,
        freshnessPolicy: "Refresh after 30 days, or when missing. Preserve curated fields.",
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
          AND i.source = 'fmp'
        `,
        [assetId],
      );

      const row = result.rows[0];
      if (!row) {
        return {
          dataset,
          status: "missing",
          lastCollectedAt: null,
          lastSuccessfulAt: null,
          latestSourceDate: null,
          freshnessPolicy: "Unknown dataset.",
          recordCount: 0,
          error: null,
        };
      }
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
        freshnessPolicy: "Refresh on every explicit full commodity retrieval.",
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

      const row = result.rows[0];
      if (!row) {
        return {
          dataset,
          status: "missing",
          lastCollectedAt: null,
          lastSuccessfulAt: null,
          latestSourceDate: null,
          freshnessPolicy: "Unknown dataset.",
          recordCount: 0,
          error: null,
        };
      }
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const latestCandle = row.latest_source_date as string | null;
      // History is fresh if we have recent candles and collected recently
      const isFresh = lastCollected && latestCandle ? isWithinDays(lastCollected, 7) : false;

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

    case "fundamentals": {
      // Not currently implemented for commodities
      return {
        dataset,
        status: "unsupported",
        lastCollectedAt: null,
        lastSuccessfulAt: null,
        latestSourceDate: null,
        freshnessPolicy: "Not implemented for commodities.",
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
 * Builds a complete coverage report for a commodity asset.
 */
export async function getCommodityCoverage(
  identity: CommodityIdentity,
): Promise<CommodityCoverageReport> {
  const client = createDbClient();
  const datasets: CommodityDatasetName[] = [
    "profile",
    "market_snapshot",
    "price_history",
    "fundamentals",
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
export async function needsCommodityRefresh(
  identity: CommodityIdentity,
  dataset: CommodityDatasetName,
  forceRefresh = false,
): Promise<{ needed: boolean; reason: string }> {
  if (forceRefresh) {
    return { needed: true, reason: "Forced refresh requested." };
  }

  const coverage = await getCommodityCoverage(identity);
  const datasetCoverage = coverage.datasets.find((d) => d.dataset === dataset);

  if (!datasetCoverage) {
    return { needed: true, reason: "Dataset not in coverage report." };
  }

  if (datasetCoverage.status === "unsupported") {
    return { needed: false, reason: "Dataset is not supported for commodities." };
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