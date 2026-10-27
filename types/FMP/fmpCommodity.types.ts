import { z } from "zod";

/**
 * Financial Modeling Prep commodity schemas and internal normalized types.
 *
 * The zod schemas describe the provider payload as observed on 2026-10-27 and are
 * used to validate untrusted responses at the boundary. They are deliberately
 * permissive where the provider is permissive: FMP returns `null` for fields it
 * does not model, and omits fields entirely for some symbols.
 *
 * Validation failure must never be treated as "no data" unless the provider
 * actually returned an empty array. See `collectors/assets/commodities/`.
 */

/** One entry from `GET /commodities-list`. */
export const fmpCommodityListItemSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  name: z.string().nullable().optional(),
  exchange: z.string().nullable().optional(),
  tradeMonth: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
});

export const fmpCommodityListResponseSchema = z.array(fmpCommodityListItemSchema);

export type FmpCommodityListResponse = z.infer<typeof fmpCommodityListResponseSchema>;

/**
 * One entry from `GET /quote?symbol=...`.
 *
 * `price` is the only field that makes a quote useful. Everything else is
 * nullable because the provider returns `null` for unmodelled concepts such as
 * `marketCap` on a commodity contract.
 */
export const fmpCommodityQuoteSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  name: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  changePercentage: z.number().nullable().optional(),
  change: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
  dayLow: z.number().nullable().optional(),
  dayHigh: z.number().nullable().optional(),
  yearHigh: z.number().nullable().optional(),
  yearLow: z.number().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  priceAvg50: z.number().nullable().optional(),
  priceAvg200: z.number().nullable().optional(),
  exchange: z.string().nullable().optional(),
  open: z.number().nullable().optional(),
  previousClose: z.number().nullable().optional(),
  /** Unix seconds, provider-assigned quote time. */
  timestamp: z.number().nullable().optional(),
});

export const fmpCommodityQuoteResponseSchema = z.array(fmpCommodityQuoteSchema);

export type FmpCommodityQuoteResponse = z.infer<typeof fmpCommodityQuoteResponseSchema>;

/** One entry from `GET /historical-price-eod/full`. */
export const fmpCommodityEodRowSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  /** Provider trading date, `YYYY-MM-DD`. */
  date: z.string().trim().min(10).max(10),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullable().optional(),
  change: z.number().nullable().optional(),
  changePercent: z.number().nullable().optional(),
  vwap: z.number().nullable().optional(),
});

export const fmpCommodityEodResponseSchema = z.array(fmpCommodityEodRowSchema);

export type FmpCommodityEodResponse = z.infer<typeof fmpCommodityEodResponseSchema>;

// --------------------------------------------------
// Normalized internal types
// --------------------------------------------------

/** A provider-listed commodity contract. */
export interface CommodityIdentity {
  provider: "fmp";
  /** Provider symbol, e.g. `GCUSD`. Never invented. */
  symbol: string;
  /** Provider-reported contract name, e.g. `Gold Futures`. */
  provider_name: string | null;
  exchange: string | null;
  trade_month: string | null;
  /** Provider-reported quote currency, e.g. `USD`. */
  currency: string | null;
  listed_at: string;
}

export interface CommodityListSnapshot {
  provider: "fmp";
  endpoint: string;
  fetched_at: string;
  commodities: CommodityIdentity[];
  /** Rows that failed schema validation. Non-zero means the payload changed. */
  rejected_rows: number;
}

/**
 * A current quote observation.
 *
 * `observed_at` is the provider's quote timestamp, not the collection time. A
 * missing provider timestamp stays null rather than borrowing `collected_at`.
 */
export interface CommodityQuote {
  provider: "fmp";
  /** Symbol that was requested. */
  symbol: string;
  /** Symbol the provider echoed back. Must match `symbol` case-insensitively. */
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
  /** Provider contract volume. Not a notional value and not a unit count. */
  volume: number | null;
  price_avg_50: number | null;
  price_avg_200: number | null;
  market_cap: number | null;
  exchange: string | null;
  observed_at: string | null;
  collected_at: string;
}

/** A single verified daily OHLC candle. */
export interface CommodityCandle {
  symbol: string;
  /** Provider trading date, `YYYY-MM-DD`. */
  date: string;
  /** `date` at UTC midnight, used as the database candle timestamp. */
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  change: number | null;
  change_percent: number | null;
  vwap: number | null;
}

export interface CommodityCandleRejection {
  date: string | null;
  reason: string;
}

export interface CommodityHistory {
  provider: "fmp";
  symbol: string;
  interval: "1d";
  fetched_at: string;
  requested: { from: string | null; to: string | null };
  candles: CommodityCandle[];
  rejected: CommodityCandleRejection[];
  /** Rows removed because the same trading date appeared twice in the response. */
  duplicates_removed: number;
}

/** Guarded identity + metadata used for the `assets.assets` upsert. */
export interface CommodityAssetInput {
  symbol: string;
  name: string;
  commodity_type: string | null;
  benchmark: string | null;
  currency: string | null;
  provider_symbol: string;
  provider_name: string | null;
  exchange: string | null;
  trade_month: string | null;
}
