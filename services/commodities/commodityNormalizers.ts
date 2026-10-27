import {
  type CommodityIdentity,
  type CommodityProfile,
  type CommodityMarketSnapshot,
  type CommodityPriceHistory,
  type CommodityCandle,
  type FmpCommodityListEntry,
  type FmpCommodityCandle,
} from "../../types/commodities/commodity.types.js";
import { findCommodityReference } from "../../collectors/assets/commodities/commodityReference.js";
import { buildCommodityAssetInput } from "../../collectors/assets/commodities/fmpCommodityNormalizer.js";
import type { CommodityQuote as FmpCommodityQuote, CommodityHistory as FmpCommodityHistory } from "../../../types/FMP/fmpCommodity.types.js";

/* -------------------------------------------------------------------------- */
/*                              FMP Normalizers                               */
/* -------------------------------------------------------------------------- */

/**
 * Converts an FMP commodity list entry + curated reference into our canonical CommodityProfile.
 */
export function normalizeCommodityProfile(
  listed: FmpCommodityListEntry,
  reference: ReturnType<typeof findCommodityReference>,
  collectedAt: string,
): CommodityProfile {
  const assetInput = buildCommodityAssetInput({
    provider: "fmp",
    symbol: listed.symbol,
    provider_name: listed.providerName,
    exchange: listed.exchange,
    trade_month: listed.tradeMonth,
    currency: listed.currency,
    listed_at: listed.listedAt,
  });

  return {
    assetId: "",
    symbol: assetInput.symbol,
    name: assetInput.name,
    commodityType: assetInput.commodity_type,
    benchmark: assetInput.benchmark,
    currency: assetInput.currency,
    unitOfMeasure: null, // FMP doesn't document contract size/units
    uses: [],
    valueDrivers: {},
    supplyDemand: {},
    inflationData: {},
    providerData: {
      fmp: {
        listed,
        reference,
        fetchedAt: collectedAt,
      },
    },
    updatedAt: collectedAt,
  };
}

/**
 * Converts an FMP quote into our canonical CommodityMarketSnapshot.
 */
export function normalizeCommodityMarketSnapshot(
  quote: FmpCommodityQuote,
): CommodityMarketSnapshot {
  return {
    provider: "FMP",
    symbol: quote.symbol,
    providerSymbol: quote.provider_symbol,
    name: quote.name,
    currency: quote.currency,
    price: quote.price,
    change: quote.change,
    changePercent: quote.change_percent,
    open: quote.open,
    previousClose: quote.previous_close,
    dayLow: quote.day_low,
    dayHigh: quote.day_high,
    yearLow: quote.year_low,
    yearHigh: quote.year_high,
    volume: quote.volume,
    priceAvg50: quote.price_avg_50,
    priceAvg200: quote.price_avg_200,
    marketCap: quote.market_cap,
    exchange: quote.exchange,
    observedAt: quote.observed_at,
    collectedAt: quote.collected_at,
  };
}

/**
 * Converts FMP history candles into our canonical CommodityCandle array.
 */
export function normalizeCommodityHistory(
  history: FmpCommodityHistory,
  requested: { from: string | null; to: string | null },
): CommodityPriceHistory {
  // Convert FMP candles to our canonical format
  const candles: CommodityCandle[] = history.candles.map((c) => ({
    symbol: c.symbol,
    date: c.date,
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    change: c.change,
    changePercent: c.change_percent,
    vwap: c.vwap,
  }));

  return {
    provider: "FMP",
    symbol: history.symbol,
    interval: "1d",
    fetchedAt: history.fetched_at,
    requested,
    candles,
    rejected: history.rejected,
    duplicatesRemoved: history.duplicates_removed,
    coverage: {
      earliestCandle: candles[0]?.timestamp ?? null,
      latestCandle: candles[candles.length - 1]?.timestamp ?? null,
      expectedCount: null,
      actualCount: candles.length,
      gaps: [],
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              Snapshot Key                                  */
/* -------------------------------------------------------------------------- */

/**
 * Builds a stable key for idempotent quote snapshots.
 * Key format: fmp:<providerSymbol>:<observedAt>
 */
export function buildCommoditySnapshotKey(snapshot: CommodityMarketSnapshot): string {
  return `fmp:${snapshot.providerSymbol}:${snapshot.observedAt ?? snapshot.collectedAt}`;
}

/**
 * Builds the assets.information.data payload for a quote observation.
 */
export function buildCommoditySnapshotData(snapshot: CommodityMarketSnapshot): Record<string, unknown> {
  return {
    provider: snapshot.provider,
    providerSymbol: snapshot.providerSymbol,
    snapshotKey: buildCommoditySnapshotKey(snapshot),
    name: snapshot.name,
    currency: snapshot.currency,
    price: snapshot.price,
    change: snapshot.change,
    changePercent: snapshot.changePercent,
    open: snapshot.open,
    previousClose: snapshot.previousClose,
    dayLow: snapshot.dayLow,
    dayHigh: snapshot.dayHigh,
    yearLow: snapshot.yearLow,
    yearHigh: snapshot.yearHigh,
    volume: snapshot.volume,
    priceAvg50: snapshot.priceAvg50,
    priceAvg200: snapshot.priceAvg200,
    marketCap: snapshot.marketCap,
    exchange: snapshot.exchange,
    observedAt: snapshot.observedAt,
    collectedAt: snapshot.collectedAt,
    limitations: [
      "Provider-reported quote; not independently verified.",
      "Volume is the provider's contract volume and has no documented unit or notional value.",
      "A quote is an observation, not a daily candle.",
    ],
  };
}