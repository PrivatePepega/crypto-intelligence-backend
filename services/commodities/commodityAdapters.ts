import "dotenv/config";

import {
  fetchCommodityCatalog,
  fetchCommodityQuote,
  fetchCommodityHistory,
  type CommodityListSnapshot,
  type CommodityQuoteFetch,
  type CommodityHistoryFetch,
} from "../../collectors/assets/commodities/fmpCommodityFetchers.js";
import { findCommodityReference } from "../../collectors/assets/commodities/commodityReference.js";
import type {
  CommodityIdentity,
  CommodityProfile,
  CommodityMarketSnapshot,
  CommodityPriceHistory,
  CommodityCandle,
} from "../../types/commodities/commodity.types.js";
import {
  normalizeCommodityProfile,
  normalizeCommodityMarketSnapshot,
  normalizeCommodityHistory,
} from "./commodityNormalizers.js";

// Local type definitions matching FMP collector's types
type FmpCommodityIdentity = {
  provider: "fmp";
  symbol: string;
  providerName: string | null;
  exchange: string | null;
  tradeMonth: string | null;
  currency: string | null;
  listedAt: string;
};

type FmpCommodityQuote = {
  provider: "fmp";
  symbol: string;
  provider_symbol: string;
  name: string | null;
  currency: string | null;
  price: number;
  change: number | null;
  change_percent: number | null;
  open: number | null;
  previous_close: number | null;
  day_low: number | null;
  day_high: number | null;
  year_low: number | null;
  year_high: number | null;
  volume: number | null;
  price_avg_50: number | null;
  price_avg_200: number | null;
  market_cap: number | null;
  exchange: string | null;
  observed_at: string | null;
  collected_at: string;
};

type FmpCommodityHistory = {
  provider: "fmp";
  symbol: string;
  interval: "1d";
  fetched_at: string;
  requested: { from: string | null; to: string | null };
  candles: Array<{
    symbol: string;
    date: string;
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    change: number | null;
    change_percent: number | null;
    vwap: number | null;
  }>;
  rejected: Array<{ date: string | null; reason: string }>;
  duplicates_removed: number;
};

/* -------------------------------------------------------------------------- */
/*                              FMP Adapters                                  */
/* -------------------------------------------------------------------------- */

export interface ProfileCollectionResult {
  profile: CommodityProfile | null;
  listed: FmpCommodityIdentity | null;
  error: string | null;
  collectedAt: string;
}

export interface MarketCollectionResult {
  snapshot: CommodityMarketSnapshot | null;
  error: string | null;
  collectedAt: string;
  sourceUrl: string;
}

export interface HistoryCollectionResult {
  history: CommodityPriceHistory | null;
  error: string | null;
  collectedAt: string;
}

/**
 * Collects commodity profile from FMP catalog + curated reference.
 */
export async function collectCommodityProfile(
  identity: CommodityIdentity,
): Promise<ProfileCollectionResult> {
  try {
    const catalog = await fetchCommodityCatalog();
    const listed = catalog.snapshot.commodities.find((c) => c.symbol === identity.symbol) as FmpCommodityIdentity | undefined;

    if (!listed) {
      return {
        profile: null,
        listed: null,
        error: `Commodity ${identity.symbol} not found in FMP catalog`,
        collectedAt: new Date().toISOString(),
      };
    }

    const reference = findCommodityReference(listed.symbol);
    const profile = normalizeCommodityProfile(listed, reference, new Date().toISOString());

    return {
      profile,
      listed,
      error: null,
      collectedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      profile: null,
      listed: null,
      error: message,
      collectedAt: new Date().toISOString(),
    };
  }
}

/**
 * Collects current market snapshot for a commodity.
 */
export async function collectCommodityMarket(
  identity: CommodityIdentity,
): Promise<MarketCollectionResult> {
  try {
    const quoteFetch = await fetchCommodityQuote(identity.symbol, { currency: identity.currency });

    if (!quoteFetch.quote) {
      return {
        snapshot: null,
        error: quoteFetch.rejection ?? "Quote fetch returned no data",
        collectedAt: new Date().toISOString(),
        sourceUrl: quoteFetch.source_url,
      };
    }

    const snapshot = normalizeCommodityMarketSnapshot(quoteFetch.quote);
    return {
      snapshot,
      error: null,
      collectedAt: quoteFetch.quote.collected_at,
      sourceUrl: quoteFetch.source_url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      snapshot: null,
      error: message,
      collectedAt: new Date().toISOString(),
      sourceUrl: "",
    };
  }
}

/**
 * Collects OHLC history for a commodity.
 */
export async function collectCommodityHistory(
  identity: CommodityIdentity,
  options: { from?: string; to?: string } = {},
): Promise<HistoryCollectionResult> {
  try {
    const defaultTo = new Date().toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const range = {
      from: options.from ?? defaultFrom,
      to: options.to ?? defaultTo,
    };

    const historyFetch = await fetchCommodityHistory(identity.symbol, range, { chunkDays: 365 });
    const history = normalizeCommodityHistory(historyFetch.history, range);

    return {
      history,
      error: historyFetch.history.rejected.length > 0
        ? `${historyFetch.history.rejected.length} rows rejected`
        : null,
      collectedAt: historyFetch.history.fetched_at,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      history: null,
      error: message,
      collectedAt: new Date().toISOString(),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                              Composite Helpers                             */
/* -------------------------------------------------------------------------- */

export interface FullCollectionResult {
  profile: ProfileCollectionResult;
  market: MarketCollectionResult;
  history: HistoryCollectionResult;
  errors: Array<{ dataset: string; message: string }>;
}

/**
 * Runs all collectors for a commodity and returns combined results.
 */
export async function collectAllCommodityData(
  identity: CommodityIdentity,
  options: { historyRange?: { from: string; to: string } } = {},
): Promise<FullCollectionResult> {
  const errors: Array<{ dataset: string; message: string }> = [];

  // 1. Profile
  const profileResult = await collectCommodityProfile(identity);
  if (profileResult.error) errors.push({ dataset: "profile", message: profileResult.error });

  // 2. Market Snapshot
  const marketResult = await collectCommodityMarket(identity);
  if (marketResult.error) errors.push({ dataset: "market_snapshot", message: marketResult.error });

  // 3. Price History
  const historyResult = await collectCommodityHistory(identity, options.historyRange ?? {});
  if (historyResult.error) errors.push({ dataset: "price_history", message: historyResult.error });

  return {
    profile: profileResult,
    market: marketResult,
    history: historyResult,
    errors,
  };
}