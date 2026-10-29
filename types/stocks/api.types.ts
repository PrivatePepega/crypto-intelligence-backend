/**
 * Stock Intelligence API contract.
 *
 * This file is deliberately separate from `stock.types.ts` so the four
 * concerns stay distinguishable:
 *
 *   Domain model        stock.types.ts   normalized, provider-agnostic shapes
 *   Persistence model   database/sql/... canonical rows + JSONB columns
 *   Collection run      CollectionMetadata (this file)  diagnostics only
 *   API response        StockIntelligenceResponse (this file)
 *
 * Diagnostics (coverage, per-dataset status, warnings, errors) are returned
 * as response metadata. They are never written to the canonical asset row.
 */

import type {
  StockIdentity,
  StockCoverageReport,
  DatasetName,
  DatasetStatus,
  InsiderTransaction,
  ThirteenFPeriod,
  BeneficialOwnershipFiling,
  CorporateActionFiling,
} from "./stock.types.js";

/* -------------------------------------------------------------------------- */
/*                        Collection-run diagnostics                          */
/* -------------------------------------------------------------------------- */

export type DatasetRunStatus = "success" | "partial" | "failed" | "skipped";

/** Per-dataset outcome of one collection run. */
export interface DatasetDiagnostic {
  dataset: DatasetName;
  status: DatasetRunStatus;
  /** Normalized records available for this dataset (events, periods, candles), counted after persistence. */
  recordsAvailable: number;
  /** Records returned by the collector during this run, when it ran. */
  recordsCollected?: number;
  /** Actionable, user-safe explanation (no stack traces or file paths). */
  message?: string;
}

/** Compact, frontend-safe view of persisted dataset coverage. */
export interface CoverageSummary {
  assetId: string;
  ticker: string;
  overallFresh: boolean;
  calculatedAt: string;
  datasets: Array<{
    dataset: string;
    status: DatasetStatus;
    lastCollectedAt: string | null;
    latestSourceDate: string | null;
    recordCount: number;
  }>;
}

/** Execution metadata for a single API call. Never canonical asset data. */
export interface CollectionMetadata {
  requestedAt: string;
  durationMs: number;
  refresh: boolean;
  readOnly: boolean;
  /** Coverage computed from persisted rows *after* any ingestion. */
  coverage: CoverageSummary;
  datasets: DatasetDiagnostic[];
  warnings: string[];
  errors: Array<{ dataset: DatasetName; message: string }>;
}

/* -------------------------------------------------------------------------- */
/*                         Business datasets (clean)                          */
/* -------------------------------------------------------------------------- */

/** Profile fields that map to persisted columns only. */
export interface CleanStockProfile {
  assetId: string;
  ticker: string;
  companyName: string;
  exchange: string | null;
  cik: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  updatedAt: string | null;
}

/** A single persisted quote observation. `providerRaw` is intentionally absent. */
export interface CleanStockQuote {
  provider: "fmp";
  symbol: string;
  providerSymbol: string;
  name: string | null;
  currency: string | null;
  price: number;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  previousClose: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  yearLow: number | null;
  yearHigh: number | null;
  volume: number | null;
  averageVolume: number | null;
  marketCap: number | null;
  priceAvg50: number | null;
  priceAvg200: number | null;
  exchange: string | null;
  /** Provider observation timestamp. */
  observedAt: string | null;
  /** Collector timestamp. */
  collectedAt: string;
  /** Stable idempotency key for the observation. */
  snapshotKey: string;
}

export interface CleanStockCandle {
  symbol: string;
  date: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  change: number | null;
  changePercent: number | null;
  vwap: number | null;
}

/**
 * Price history is derived from persisted candles. Requested ranges and
 * rejected-row counts are run metadata and therefore excluded here.
 * `candles` holds the 30 most recent daily candles.
 */
export interface CleanStockHistory {
  provider: "fmp";
  symbol: string;
  interval: "1d";
  /** Date of the first candle in `candles`. */
  effectiveFrom: string | null;
  /** Date of the last candle in `candles`. */
  effectiveTo: string | null;
  candles: CleanStockCandle[];
}

export interface CleanFinancialStatementPeriod {
  fy: number;
  period: "FY" | "Q1" | "Q2" | "Q3" | "Q4";
  concepts: Record<
    string,
    {
      concept: string;
      value: number | null;
      unit: string;
      periodEnd: string;
      filingDate: string;
      accessionNumber: string;
      form: string;
    }
  >;
}

export interface CleanFinancialStatements {
  annual: CleanFinancialStatementPeriod[];
  quarterly: CleanFinancialStatementPeriod[];
  source: "sec_companyfacts";
  cik: string;
  entityName: string;
  normalizedAt: string;
}

export interface CleanFinancialMetrics {
  periods: Array<{
    fy: number;
    period: "FY" | "Q1" | "Q2" | "Q3" | "Q4";
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    currentRatio: number | null;
    debtToEquity: number | null;
    freeCashFlow: number | null;
    returnOnAssets: number | null;
    returnOnEquity: number | null;
    revenueGrowth: number | null;
  }>;
  source: "sec_companyfacts";
  cik: string;
  computedAt: string;
}

export type SecEventSource =
  | "sec_insider"
  | "sec_13f"
  | "sec_13dg"
  | "sec_corporate_action";

/** One persisted `assets.information` event row. */
export interface CleanSecEvent<T> {
  id: string;
  assetId: string;
  informationType: "event";
  source: SecEventSource;
  data: T;
  sourceUrl: string | null;
  /** Filing / observation date from the source. */
  observedAt: string | null;
  collectedAt: string;
  dedupeKey: string;
}

/* -------------------------------------------------------------------------- */
/*                              API response                                  */
/* -------------------------------------------------------------------------- */

export interface StockIntelligenceResponse {
  identity: StockIdentity;

  profile: CleanStockProfile | null;
  quote: CleanStockQuote | null;
  history: CleanStockHistory | null;
  financialStatements: CleanFinancialStatements | null;
  financialMetrics: CleanFinancialMetrics | null;

  /**
   * Persisted individual SEC records, newest first. Each array is capped at the
   * 200 most recent records; `metadata.datasets[].recordsAvailable` reports the
   * total number persisted.
   */
  insiderTransactions: Array<CleanSecEvent<InsiderTransaction>>;
  institutionalHoldings: Array<CleanSecEvent<ThirteenFPeriod>>;
  beneficialOwnership: Array<CleanSecEvent<BeneficialOwnershipFiling>>;
  corporateActions: Array<CleanSecEvent<CorporateActionFiling>>;
  metadata: CollectionMetadata;
}

/** Internal service result: response data plus the raw coverage report. */
export interface StockIntelligenceServiceResult
  extends Omit<StockIntelligenceResponse, "metadata"> {
  coverage: StockCoverageReport;
  collectionMetadata: CollectionMetadata;
}

/* -------------------------------------------------------------------------- */
/*                              Conversions                                  */
/* -------------------------------------------------------------------------- */

export function toCoverageSummary(report: StockCoverageReport): CoverageSummary {
  return {
    assetId: report.assetId,
    ticker: report.ticker,
    overallFresh: report.overallFresh,
    calculatedAt: report.collectedAt,
    datasets: report.datasets.map((entry) => ({
      dataset: entry.dataset,
      status: entry.status,
      lastCollectedAt: entry.lastCollectedAt,
      latestSourceDate: entry.latestSourceDate,
      recordCount: entry.recordCount,
    })),
  };
}

export function toApiResponse(
  result: StockIntelligenceServiceResult,
): StockIntelligenceResponse {
  return {
    identity: result.identity,
    profile: result.profile,
    quote: result.quote,
    history: result.history,
    financialStatements: result.financialStatements,
    financialMetrics: result.financialMetrics,
    insiderTransactions: result.insiderTransactions,
    institutionalHoldings: result.institutionalHoldings,
    beneficialOwnership: result.beneficialOwnership,
    corporateActions: result.corporateActions,
    metadata: result.collectionMetadata,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Contract Validation                               */
/* -------------------------------------------------------------------------- */

/**
 * Top-level fields every response carries. Nullable datasets are still present
 * as `null`, so a missing key is always a contract violation.
 */
export const STOCK_RESPONSE_REQUIRED_KEYS = [
  "identity",
  "profile",
  "quote",
  "history",
  "financialStatements",
  "financialMetrics",
  "insiderTransactions",
  "institutionalHoldings",
  "beneficialOwnership",
  "corporateActions",
  "metadata",
] as const;

const STOCK_RESPONSE_OBJECT_KEYS = [
  "profile",
  "quote",
  "history",
  "financialStatements",
  "financialMetrics",
] as const;

const STOCK_RESPONSE_EVENT_KEYS = [
  "insiderTransactions",
  "institutionalHoldings",
  "beneficialOwnership",
  "corporateActions",
] as const;

const DATASET_NAMES = [
  "profile",
  "quote",
  "history",
  "financial_statements",
  "financial_metrics",
  "insider_transactions",
  "institutional_holdings",
  "beneficial_ownership",
  "corporate_actions",
] as const;

const DATASET_RUN_STATUSES = ["success", "partial", "failed", "skipped"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks a decoded response payload against the public contract.
 *
 * Returns human-readable problems; an empty array means the payload is valid.
 * This validates the response shape only — it makes no claim about whether the
 * analysed stock data is correct.
 */
export function findStockApiPayloadProblems(payload: unknown): string[] {
  const problems: string[] = [];

  if (!isPlainObject(payload)) {
    return ["payload must be a JSON object"];
  }

  const allowed = new Set<string>(STOCK_RESPONSE_REQUIRED_KEYS);
  for (const key of STOCK_RESPONSE_REQUIRED_KEYS) {
    if (!(key in payload)) {
      problems.push(`missing top-level field: ${key}`);
    }
  }
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      problems.push(`unexpected top-level field: ${key}`);
    }
  }

  const identity = payload["identity"];
  if (!isPlainObject(identity)) {
    problems.push("identity must be an object");
  } else if (typeof identity["assetId"] !== "string" || identity["assetId"].length === 0) {
    problems.push("identity.assetId must be a non-empty string");
  } else if (typeof identity["ticker"] !== "string" || identity["ticker"].length === 0) {
    problems.push("identity.ticker must be a non-empty string");
  }

  for (const key of STOCK_RESPONSE_OBJECT_KEYS) {
    const value = payload[key];
    if (value !== null && !isPlainObject(value)) {
      problems.push(`${key} must be an object or null`);
    }
  }

  for (const key of STOCK_RESPONSE_EVENT_KEYS) {
    if (!Array.isArray(payload[key])) {
      problems.push(`${key} must be an array`);
    }
  }

  const history = payload["history"];
  if (isPlainObject(history)) {
    if (!Array.isArray(history["candles"])) {
      problems.push("history.candles must be an array");
    } else {
      const candles = history["candles"];
      for (let index = 0; index < candles.length; index++) {
        const candle = candles[index];
        if (!isPlainObject(candle)) {
          problems.push(`history.candles[${index}] must be an object`);
          break;
        }
        for (const field of ["open", "high", "low", "close"]) {
          if (typeof candle[field] !== "number" || !Number.isFinite(candle[field] as number)) {
            problems.push(`history.candles[${index}].${field} must be a finite number`);
          }
        }
      }
    }
  }

  const metadata = payload["metadata"];
  if (!isPlainObject(metadata)) {
    problems.push("metadata must be an object");
    return problems;
  }

  if (typeof metadata["requestedAt"] !== "string") {
    problems.push("metadata.requestedAt must be a string");
  }
  if (typeof metadata["durationMs"] !== "number") {
    problems.push("metadata.durationMs must be a number");
  }
  if (typeof metadata["refresh"] !== "boolean") {
    problems.push("metadata.refresh must be a boolean");
  }
  if (typeof metadata["readOnly"] !== "boolean") {
    problems.push("metadata.readOnly must be a boolean");
  }
  if (!Array.isArray(metadata["warnings"])) {
    problems.push("metadata.warnings must be an array");
  }
  if (!Array.isArray(metadata["errors"])) {
    problems.push("metadata.errors must be an array");
  } else {
    for (const [index, entry] of (metadata["errors"] as unknown[]).entries()) {
      if (!isPlainObject(entry) || typeof entry["dataset"] !== "string" || typeof entry["message"] !== "string") {
        problems.push(`metadata.errors[${index}] must be {dataset, message}`);
      }
    }
  }

  const coverage = metadata["coverage"];
  if (!isPlainObject(coverage)) {
    problems.push("metadata.coverage must be an object");
  } else if (!Array.isArray(coverage["datasets"])) {
    problems.push("metadata.coverage.datasets must be an array");
  }

  const datasets = metadata["datasets"];
  if (!Array.isArray(datasets)) {
    problems.push("metadata.datasets must be an array");
  } else {
    const seen = new Set<string>();
    for (const [index, entry] of datasets.entries()) {
      if (!isPlainObject(entry)) {
        problems.push(`metadata.datasets[${index}] must be an object`);
        continue;
      }
      const dataset = entry["dataset"];
      if (typeof dataset !== "string" || !DATASET_NAMES.includes(dataset as (typeof DATASET_NAMES)[number])) {
        problems.push(`metadata.datasets[${index}].dataset is unknown`);
      } else {
        seen.add(dataset);
      }
      if (
        typeof entry["status"] !== "string" ||
        !DATASET_RUN_STATUSES.includes(entry["status"] as (typeof DATASET_RUN_STATUSES)[number])
      ) {
        problems.push(`metadata.datasets[${index}].status is invalid`);
      }
      if (typeof entry["recordsAvailable"] !== "number") {
        problems.push(`metadata.datasets[${index}].recordsAvailable must be a number`);
      }
    }
    for (const dataset of DATASET_NAMES) {
      if (!seen.has(dataset)) {
        problems.push(`metadata.datasets is missing dataset: ${dataset}`);
      }
    }
  }

  return problems;
}
