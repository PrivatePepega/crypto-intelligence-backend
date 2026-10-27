import { z } from "zod";

/**
 * Commodity intelligence types for the deterministic ingestion service.
 *
 * These types describe the canonical shapes used by the commodity resolver,
 * coverage checker, ingestion planner, normalizers, and repositories.
 * They are separate from provider-specific schemas so the service layer
 * never depends on FMP field names directly.
 */

/* -------------------------------------------------------------------------- */
/*                                  Identity                                  */
/* -------------------------------------------------------------------------- */

/** Provider-agnostic canonical commodity identifier. */
export interface CommodityIdentity {
  /** Our canonical asset UUID. */
  assetId: string;
  /** Provider symbol (e.g., GCUSD, SIUSD, CLUSD). */
  symbol: string;
  /** Canonical display name. */
  name: string;
  /** Commodity type classification. */
  commodityType: string | null;
  /** Benchmark reference (e.g., COMEX gold, WTI, Brent). */
  benchmark: string | null;
  /** Quote currency (typically USD). */
  currency: string | null;
  /** Provider-specific identifiers, keyed by provider. */
  providerIds: Record<string, Record<string, unknown>>;
}

/** Result of resolving a user query to a canonical commodity. */
export type CommodityResolutionResult =
  | { kind: "resolved"; identity: CommodityIdentity }
  | { kind: "not_found"; message: string }
  | { kind: "ambiguous"; candidates: CommodityIdentity[]; message: string };

/** Lightweight candidate for autocomplete/search. */
export interface CommoditySearchCandidate {
  symbol: string;
  name: string;
  commodityType: string | null;
  benchmark: string | null;
  currency: string | null;
  provider: "FMP";
}

/* -------------------------------------------------------------------------- */
/*                              Provider Inputs                               */
/* -------------------------------------------------------------------------- */

/** FMP commodity list entry from /commodities-list. */
export interface FmpCommodityListEntry {
  provider: "fmp";
  symbol: string;
  providerName: string | null;
  exchange: string | null;
  tradeMonth: string | null;
  currency: string | null;
  listedAt: string;
}

/** FMP commodity quote response. */
export interface FmpCommodityQuote {
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
  priceAvg50: number | null;
  priceAvg200: number | null;
  marketCap: number | null;
  exchange: string | null;
  observedAt: string | null;
  collectedAt: string;
}

/** FMP commodity OHLC candle. */
export interface FmpCommodityCandle {
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

/** FMP commodity history response. */
export interface FmpCommodityHistory {
  provider: "fmp";
  symbol: string;
  interval: "1d";
  fetchedAt: string;
  requested: { from: string | null; to: string | null };
  candles: FmpCommodityCandle[];
  rejected: Array<{ date: string | null; reason: string }>;
  duplicatesRemoved: number;
}

/* -------------------------------------------------------------------------- */
/*                            Normalized Commodity Data                       */
/* -------------------------------------------------------------------------- */

/** Normalized commodity profile (merged FMP + curated reference). */
export interface CommodityProfile {
  assetId: string;
  symbol: string;
  name: string;
  commodityType: string | null;
  benchmark: string | null;
  currency: string | null;
  unitOfMeasure: string | null;
  uses: string[];
  valueDrivers: Record<string, unknown>;
  supplyDemand: Record<string, unknown>;
  inflationData: Record<string, unknown>;
  providerData: Record<string, unknown>;
  updatedAt: string;
}

/** Normalized current quote / market snapshot. */
export interface CommodityMarketSnapshot {
  provider: "FMP";
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
  priceAvg50: number | null;
  priceAvg200: number | null;
  marketCap: number | null;
  exchange: string | null;
  observedAt: string | null;
  collectedAt: string;
}

/** Normalized daily OHLC candle. */
export interface CommodityCandle {
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

/** Historical price data with coverage tracking. */
export interface CommodityPriceHistory {
  provider: "FMP";
  symbol: string;
  interval: "1d";
  fetchedAt: string;
  requested: { from: string | null; to: string | null };
  candles: CommodityCandle[];
  rejected: Array<{ date: string | null; reason: string }>;
  duplicatesRemoved: number;
  coverage: {
    earliestCandle: string | null;
    latestCandle: string | null;
    expectedCount: number | null;
    actualCount: number;
    gaps: Array<{ from: string; to: string }>;
  };
}

/* -------------------------------------------------------------------------- */
/*                         Coverage & Freshness                               */
/* -------------------------------------------------------------------------- */

export type CommodityDatasetStatus =
  | "missing"
  | "fresh"
  | "stale"
  | "partial"
  | "failed"
  | "unsupported";

export interface CommodityDatasetCoverage {
  dataset: string;
  status: CommodityDatasetStatus;
  lastCollectedAt: string | null;
  lastSuccessfulAt: string | null;
  latestSourceDate: string | null;
  freshnessPolicy: string;
  recordCount: number;
  error: string | null;
  coverageMetadata?: Record<string, unknown>;
}

export interface CommodityCoverageReport {
  assetId: string;
  symbol: string;
  datasets: CommodityDatasetCoverage[];
  overallFresh: boolean;
  collectedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                           Ingestion Planning                               */
/* -------------------------------------------------------------------------- */

export type CommodityDatasetName =
  | "profile"
  | "market_snapshot"
  | "price_history"
  | "fundamentals"; // Not currently implemented for commodities

export interface CommodityIngestionPlanStep {
  dataset: CommodityDatasetName;
  reason: string;
  priority: number; // lower = higher priority
  estimatedRequests: number;
  dependsOn: CommodityDatasetName[];
}

export interface CommodityIngestionPlan {
  assetId: string;
  symbol: string;
  steps: CommodityIngestionPlanStep[];
  totalEstimatedRequests: number;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                           Service Input/Output                             */
/* -------------------------------------------------------------------------- */

export interface GetOrIngestCommodityOptions {
  /** Force refresh even if data appears fresh. */
  refresh: boolean | undefined;
  /** Only include these datasets in the response (default: all available). */
  include: CommodityDatasetName[] | undefined;
  /** Skip ingestion entirely; only read from DB. */
  readOnly: boolean | undefined;
  /** Price history range override. */
  historyRange?: { from: string; to: string };
}

export interface CommodityIntelligenceResult {
  identity: CommodityIdentity;
  profile: CommodityProfile | null;
  market: CommodityMarketSnapshot | null;
  priceHistory: CommodityPriceHistory | null;
  coverage: CommodityCoverageReport;
  errors: Array<{ dataset: CommodityDatasetName; message: string }>;
}

/** Minimal database surface used by services, so tests can fake it. */
export interface DbClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}