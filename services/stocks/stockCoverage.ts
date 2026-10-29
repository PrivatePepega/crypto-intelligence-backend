import "dotenv/config";

import pool from "../../config/database.js";
import { getFreshnessPolicy } from "./freshnessPolicy.js";
import type {
  DbClient,
  DatasetCoverage,
  StockCoverageReport,
  StockIdentity,
  DatasetName,
} from "../../types/stocks/stock.types.js";

// Re-export types for consumers
export type { StockCoverageReport, DatasetCoverage, DbClient };

/* -------------------------------------------------------------------------- */
/*                              DB Client Adapter                             */
/* -------------------------------------------------------------------------- */

export function createDbClient(
  pg?: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> },
): DbClient {
  const connection = pg ?? pool;
  return {
    async query(text, values) {
      const result = await connection.query(text, values);
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
  dataset: DatasetName,
): Promise<DatasetCoverage> {
  // If assetId is empty, the asset doesn't exist yet - all datasets are missing
  if (!assetId) {
    return {
      dataset,
      status: "missing",
      lastCollectedAt: null,
      lastSuccessfulAt: null,
      latestSourceDate: null,
      freshnessPolicy: getFreshnessPolicy(dataset).description,
      recordCount: 0,
      error: null,
    };
  }

  switch (dataset) {
    case "profile": {
      const result = await client.query(
        `
        SELECT 
          s.updated_at AS last_collected_at,
          s.updated_at AS last_successful_at,
          NULL AS latest_source_date,
          1 AS record_count,
          NULL AS error_message
        FROM assets.stocks s
        WHERE s.asset_id = $1
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

      const row = result.rows[0] ?? {};
      const lastCollected = row.last_collected_at as string | null;
      const isFresh = lastCollected ? isWithinDays(lastCollected, 7) : false;

      return {
        dataset,
        status: isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: null,
        freshnessPolicy: "Refresh after 7 days, or when missing.",
        recordCount: Number(row.record_count ?? 1),
        error: row.error_message as string | null,
      };
    }

    case "quote": {
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'observed_at') AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'market_snapshot'
          AND i.source = 'fmp'
        `,
        [assetId],
      );

      const row = result.rows[0] ?? {};
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      // Quote is refreshed on every explicit retrieval, so it's fresh if collected today
      const isFresh = lastCollected ? isSameDay(lastCollected, new Date().toISOString()) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Refresh on every explicit full stock retrieval.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "history": {
      const result = await client.query(
        `
        SELECT 
          MAX(h.created_at) AS last_collected_at,
          MAX(h.created_at) AS last_successful_at,
          MAX(h.timestamp) AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.asset_price_history h
        WHERE h.asset_id = $1 AND h.interval = '1d'
        `,
        [assetId],
      );

      const row = result.rows[0] ?? {};
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
      };
    }

    case "financial_statements": {
      const result = await client.query(
        `
        SELECT 
          s.updated_at AS last_collected_at,
          s.updated_at AS last_successful_at,
          NULL AS latest_source_date,
          CASE WHEN s.financial_statements IS NULL OR jsonb_typeof(s.financial_statements) <> 'object' OR s.financial_statements = '{}'::jsonb THEN 0 ELSE 1 END AS record_count,
          NULL AS error_message
        FROM assets.stocks s
        WHERE s.asset_id = $1
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
          freshnessPolicy: "Refresh when new SEC filing available, or periodically check.",
          recordCount: 0,
          error: null,
        };
      }

      const row = result.rows[0] ?? {};
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      // Financial statements are fresh if collected within 90 days (quarterly cycle)
      const isFresh = lastCollected ? isWithinDays(lastCollected, 90) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: null,
        freshnessPolicy: "Refresh when new SEC filing available, or periodically check.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "financial_metrics": {
      const result = await client.query(
        `
        SELECT 
          s.updated_at AS last_collected_at,
          s.updated_at AS last_successful_at,
          NULL AS latest_source_date,
          CASE WHEN s.financial_metrics IS NULL OR jsonb_typeof(s.financial_metrics) <> 'object' OR s.financial_metrics = '{}'::jsonb THEN 0 ELSE 1 END AS record_count,
          NULL AS error_message
        FROM assets.stocks s
        WHERE s.asset_id = $1
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
          freshnessPolicy: "Refresh when financial statements refresh.",
          recordCount: 0,
          error: null,
        };
      }

      const row = result.rows[0] ?? {};
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const isFresh = lastCollected ? isWithinDays(lastCollected, 90) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: null,
        freshnessPolicy: "Refresh when financial statements refresh.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "insider_transactions": {
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'filingDate') AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'event'
          AND i.source = 'sec_insider'
        `,
        [assetId],
      );

      const row = result.rows[0] ?? {};
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const isFresh = lastCollected ? isWithinDays(lastCollected, 7) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Incrementally check for new Forms 3, 4, and 5.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "institutional_holdings": {
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'reportPeriod') AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'event'
          AND i.source = 'sec_13f'
        `,
        [assetId],
      );

      const row = result.rows[0] ?? {};
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      // 13F filings have 45-day delay after quarter end
      const isFresh = lastCollected ? isWithinDays(lastCollected, 60) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Check for newly filed or amended 13F reports; respect reporting delays.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "beneficial_ownership": {
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'filingDate') AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'event'
          AND i.source = 'sec_13dg'
        `,
        [assetId],
      );

      const row = result.rows[0] ?? {};
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const isFresh = lastCollected ? isWithinDays(lastCollected, 30) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Check for new or amended 13D/13G filings.",
        recordCount,
        error: row.error_message as string | null,
      };
    }

    case "corporate_actions": {
      const result = await client.query(
        `
        SELECT 
          MAX(i.collected_at) AS last_collected_at,
          MAX(i.collected_at) AS last_successful_at,
          MAX(i.data->>'filingDate') AS latest_source_date,
          COUNT(*) AS record_count,
          NULL AS error_message
        FROM assets.information i
        WHERE i.asset_id = $1
          AND i.information_type = 'event'
          AND i.source = 'sec_corporate_action'
        `,
        [assetId],
      );

      const row = result.rows[0] ?? {};
      const lastCollected = row.last_collected_at as string | null;
      const recordCount = Number(row.record_count ?? 0);
      const isFresh = lastCollected ? isWithinDays(lastCollected, 14) : false;

      return {
        dataset,
        status: recordCount === 0 ? "missing" : isFresh ? "fresh" : "stale",
        lastCollectedAt: lastCollected,
        lastSuccessfulAt: row.last_successful_at as string | null,
        latestSourceDate: row.latest_source_date as string | null,
        freshnessPolicy: "Check for new relevant filings and refresh extracted records.",
        recordCount,
        error: row.error_message as string | null,
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
 * Builds a complete coverage report for a stock asset.
 */
export async function getStockCoverage(
  identity: StockIdentity,
): Promise<StockCoverageReport> {
  const client = createDbClient();
  const datasets: DatasetName[] = [
    "profile",
    "quote",
    "history",
    "financial_statements",
    "financial_metrics",
    "insider_transactions",
    "institutional_holdings",
    "beneficial_ownership",
    "corporate_actions",
  ];

  const coverage = await Promise.all(
    datasets.map((dataset) => checkDatasetCoverage(client, identity.assetId, dataset)),
  );

  const overallFresh = coverage.every((c) => c.status === "fresh");

  return {
    assetId: identity.assetId,
    ticker: identity.ticker,
    datasets: coverage,
    overallFresh,
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Checks if a specific dataset needs refresh.
 */
export async function needsRefresh(
  identity: StockIdentity,
  dataset: DatasetName,
  forceRefresh = false,
): Promise<{ needed: boolean; reason: string }> {
  if (forceRefresh) {
    return { needed: true, reason: "Forced refresh requested." };
  }

  const coverage = await getStockCoverage(identity);
  const datasetCoverage = coverage.datasets.find((d) => d.dataset === dataset);

  if (!datasetCoverage) {
    return { needed: true, reason: "Dataset not in coverage report." };
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