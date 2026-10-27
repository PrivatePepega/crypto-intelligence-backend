import {
  fmpCommodityEodRowSchema,
  fmpCommodityListItemSchema,
  fmpCommodityQuoteSchema,
  type CommodityAssetInput,
  type CommodityCandle,
  type CommodityCandleRejection,
  type CommodityHistory,
  type CommodityIdentity,
  type CommodityListSnapshot,
  type CommodityQuote,
} from "../../../types/FMP/fmpCommodity.types.js";
import { findCommodityReference } from "./commodityReference.js";

/**
 * Pure normalization for FMP commodity payloads.
 *
 * Rules applied here:
 *
 *   - Provider data is untrusted. Rows are validated individually so one
 *     malformed row cannot discard the rest of a response.
 *   - Unknown or unavailable values become `null`, never `0` and never `false`.
 *   - Nothing is derived. Candles are only built from provider OHLC rows; no
 *     candle is synthesized from a scalar quote price.
 *   - Negative prices are preserved. WTI settled at -37.63 on 2020-04-20, so a
 *     positivity check would corrupt real history.
 *   - A provider trading date is timezone-free. It is stored as UTC midnight and
 *     documented as the exchange trading session, not a UTC day boundary.
 */

const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

/** Lower bound for a plausible quote timestamp (2000-01-01T00:00:00Z). */
const MIN_QUOTE_UNIX_SECONDS = 946_684_800;
/** Upper bound for a plausible quote timestamp (2100-01-01T00:00:00Z). */
const MAX_QUOTE_UNIX_SECONDS = 4_102_444_800;

/** Validates a `YYYY-MM-DD` provider date, rejecting impossible calendar days. */
export function parseProviderDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < MIN_YEAR || year > MAX_YEAR) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return trimmed;
}

/** Converts a provider trading date to the candle timestamp (UTC midnight). */
export function providerDateToTimestamp(date: string): string {
  const parsed = parseProviderDate(date);
  if (parsed === null) {
    throw new Error(`Invalid provider date: ${date}`);
  }
  return `${parsed}T00:00:00.000Z`;
}

/** Converts a provider unix-seconds timestamp to ISO, or null when implausible. */
export function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }
  if (value < MIN_QUOTE_UNIX_SECONDS || value > MAX_QUOTE_UNIX_SECONDS) {
    return null;
  }
  return new Date(value * 1_000).toISOString();
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeOrNull(value: unknown): number | null {
  const parsed = finiteOrNull(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function trimmedName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, 200);
}

/** Normalizes a provider currency code, uppercasing only recognised 3-letter codes. */
export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : null;
}

// --------------------------------------------------
// Commodity list
// --------------------------------------------------

export interface CommodityListInput {
  endpoint: string;
  fetchedAt: string;
  symbolHint?: string;
}

/**
 * Normalizes `GET /commodities-list`.
 *
 * Duplicate symbols are collapsed, keeping the first listing. Rows without a
 * usable symbol are counted in `rejected_rows`.
 */
export function normalizeCommodityList(
  raw: unknown,
  input: CommodityListInput,
): CommodityListSnapshot {
  const snapshot: CommodityListSnapshot = {
    provider: "fmp",
    endpoint: input.endpoint,
    fetched_at: input.fetchedAt,
    commodities: [],
    rejected_rows: 0,
  };

  if (!Array.isArray(raw)) {
    snapshot.rejected_rows = 1;
    return snapshot;
  }

  const seen = new Set<string>();

  for (const row of raw) {
    const parsed = fmpCommodityListItemSchema.safeParse(row);
    if (!parsed.success) {
      snapshot.rejected_rows += 1;
      continue;
    }

    const symbol = parsed.data.symbol.toUpperCase();
    if (seen.has(symbol)) {
      snapshot.rejected_rows += 1;
      continue;
    }
    seen.add(symbol);

    const identity: CommodityIdentity = {
      provider: "fmp",
      symbol,
      provider_name: trimmedName(parsed.data.name),
      exchange: trimmedName(parsed.data.exchange),
      trade_month: trimmedName(parsed.data.tradeMonth),
      currency: normalizeCurrency(parsed.data.currency),
      listed_at: input.fetchedAt,
    };

    snapshot.commodities.push(identity);
  }

  return snapshot;
}

/** Finds one provider identity by symbol, case-insensitively. */
export function findListedCommodity(
  snapshot: CommodityListSnapshot,
  symbol: string,
): CommodityIdentity | null {
  const wanted = symbol.trim().toUpperCase();
  return snapshot.commodities.find((entry) => entry.symbol === wanted) ?? null;
}

// --------------------------------------------------
// Quote
// --------------------------------------------------

export type CommodityQuoteResult =
  { ok: true; quote: CommodityQuote } | { ok: false; reason: string };

export interface CommodityQuoteInput {
  /** Symbol that was requested. */
  symbol: string;
  /** Provider-reported currency from the commodity list, when known. */
  currency: string | null;
  collectedAt: string;
}

/**
 * Normalizes one row from `GET /quote`.
 *
 * A quote without a finite price is rejected rather than stored with a fabricated
 * value. `observed_at` comes only from the provider timestamp.
 */
export function normalizeCommodityQuote(
  raw: unknown,
  input: CommodityQuoteInput,
): CommodityQuoteResult {
  const parsed = fmpCommodityQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `quote failed validation${issue ? `: ${issue.path.join(".")} ${issue.message}` : ""}`,
    };
  }

  const expected = input.symbol.trim().toUpperCase();
  const providerSymbol = parsed.data.symbol.trim().toUpperCase();

  if (providerSymbol !== expected) {
    return {
      ok: false,
      reason: `provider returned symbol ${providerSymbol} for requested ${expected}`,
    };
  }

  const price = finiteOrNull(parsed.data.price);
  if (price === null) {
    return { ok: false, reason: "quote has no finite price" };
  }

  return {
    ok: true,
    quote: {
      provider: "fmp",
      symbol: expected,
      provider_symbol: providerSymbol,
      name: trimmedName(parsed.data.name),
      currency: normalizeCurrency(input.currency),
      price,
      change: finiteOrNull(parsed.data.change),
      change_percent: finiteOrNull(parsed.data.changePercentage),
      open: finiteOrNull(parsed.data.open),
      previous_close: finiteOrNull(parsed.data.previousClose),
      day_low: finiteOrNull(parsed.data.dayLow),
      day_high: finiteOrNull(parsed.data.dayHigh),
      year_low: finiteOrNull(parsed.data.yearLow),
      year_high: finiteOrNull(parsed.data.yearHigh),
      volume: nonNegativeOrNull(parsed.data.volume),
      price_avg_50: finiteOrNull(parsed.data.priceAvg50),
      price_avg_200: finiteOrNull(parsed.data.priceAvg200),
      market_cap: nonNegativeOrNull(parsed.data.marketCap),
      exchange: trimmedName(parsed.data.exchange),
      observed_at: unixSecondsToIso(parsed.data.timestamp),
      collected_at: input.collectedAt,
    },
  };
}

/**
 * Stable identity for a quote observation.
 *
 * Used to make `assets.information` inserts idempotent: the same provider quote
 * timestamp never produces a second snapshot.
 */
export function buildSnapshotKey(quote: CommodityQuote): string {
  return `${quote.provider}:${quote.provider_symbol}:${quote.observed_at ?? quote.collected_at}`;
}

/** Builds the `assets.information.data` payload for a quote observation. */
export function buildMarketSnapshotData(quote: CommodityQuote): Record<string, unknown> {
  return {
    provider: quote.provider,
    provider_symbol: quote.provider_symbol,
    snapshot_key: buildSnapshotKey(quote),
    name: quote.name,
    currency: quote.currency,
    price: quote.price,
    change: quote.change,
    change_percent: quote.change_percent,
    open: quote.open,
    previous_close: quote.previous_close,
    day_low: quote.day_low,
    day_high: quote.day_high,
    year_low: quote.year_low,
    year_high: quote.year_high,
    volume: quote.volume,
    volume_unit: null,
    price_avg_50: quote.price_avg_50,
    price_avg_200: quote.price_avg_200,
    market_cap: quote.market_cap,
    exchange: quote.exchange,
    observed_at: quote.observed_at,
    collected_at: quote.collected_at,
    limitations: [
      "Provider-reported quote; not independently verified.",
      "Volume is the provider's contract volume and has no documented unit or notional value.",
      "A quote is an observation, not a daily candle.",
    ],
  };
}

// --------------------------------------------------
// Historical daily OHLC
// --------------------------------------------------

function toCandle(
  symbol: string,
  row: {
    symbol: string;
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number | null | undefined;
    change?: number | null | undefined;
    changePercent?: number | null | undefined;
    vwap?: number | null | undefined;
  },
): { candle: CommodityCandle | null; rejection: CommodityCandleRejection | null } {
  const date = parseProviderDate(row.date);
  if (date === null) {
    return {
      candle: null,
      rejection: {
        date: typeof row.date === "string" ? row.date.slice(0, 20) : null,
        reason: "invalid date",
      },
    };
  }

  const open = finiteOrNull(row.open);
  const high = finiteOrNull(row.high);
  const low = finiteOrNull(row.low);
  const close = finiteOrNull(row.close);

  if (open === null || high === null || low === null || close === null) {
    return { candle: null, rejection: { date, reason: "non-finite OHLC value" } };
  }

  if (high < low) {
    return { candle: null, rejection: { date, reason: "high is below low" } };
  }

  if (open > high || open < low) {
    return { candle: null, rejection: { date, reason: "open is outside the low/high range" } };
  }

  if (close > high || close < low) {
    return { candle: null, rejection: { date, reason: "close is outside the low/high range" } };
  }

  return {
    candle: {
      symbol,
      date,
      timestamp: `${date}T00:00:00.000Z`,
      open,
      high,
      low,
      close,
      volume: nonNegativeOrNull(row.volume),
      change: finiteOrNull(row.change),
      change_percent: finiteOrNull(row.changePercent),
      vwap: finiteOrNull(row.vwap),
    },
    rejection: null,
  };
}

export interface CommodityHistoryInput {
  symbol: string;
  fetchedAt: string;
  requested: { from: string | null; to: string | null };
}

/**
 * Normalizes `GET /historical-price-eod/full` rows.
 *
 * The provider returns rows newest-first and may repeat a trading date when
 * several request windows overlap. Output is deduplicated by trading date and
 * sorted oldest-first so the caller can chunk freely.
 */
export function normalizeCommodityHistory(
  raw: unknown,
  input: CommodityHistoryInput,
): CommodityHistory {
  const symbol = input.symbol.trim().toUpperCase();

  const history: CommodityHistory = {
    provider: "fmp",
    symbol,
    interval: "1d",
    fetched_at: input.fetchedAt,
    requested: input.requested,
    candles: [],
    rejected: [],
    duplicates_removed: 0,
  };

  if (!Array.isArray(raw)) {
    history.rejected.push({ date: null, reason: "response was not an array" });
    return history;
  }

  const byDate = new Map<string, CommodityCandle>();

  for (const row of raw) {
    const parsed = fmpCommodityEodRowSchema.safeParse(row);
    if (!parsed.success) {
      const dateGuess =
        row && typeof row === "object" && "date" in row
          ? String((row as Record<string, unknown>)["date"]).slice(0, 20)
          : null;
      history.rejected.push({ date: dateGuess, reason: "row failed validation" });
      continue;
    }

    if (parsed.data.symbol.trim().toUpperCase() !== symbol) {
      history.rejected.push({
        date: parsed.data.date,
        reason: `row belongs to symbol ${parsed.data.symbol.trim().toUpperCase()}`,
      });
      continue;
    }

    const { candle, rejection } = toCandle(symbol, parsed.data);
    if (rejection !== null) {
      history.rejected.push(rejection);
      continue;
    }
    if (candle === null) {
      continue;
    }

    if (byDate.has(candle.date)) {
      history.duplicates_removed += 1;
    }
    byDate.set(candle.date, candle);
  }

  history.candles = [...byDate.values()].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );

  return history;
}

/** Merges several already-normalized history windows for the same symbol. */
export function mergeCommodityHistories(
  symbol: string,
  fetchedAt: string,
  requested: { from: string | null; to: string | null },
  histories: CommodityHistory[],
): CommodityHistory {
  const merged: CommodityHistory = {
    provider: "fmp",
    symbol: symbol.trim().toUpperCase(),
    interval: "1d",
    fetched_at: fetchedAt,
    requested,
    candles: [],
    rejected: [],
    duplicates_removed: 0,
  };

  const byDate = new Map<string, CommodityCandle>();

  for (const history of histories) {
    merged.rejected.push(...history.rejected);
    merged.duplicates_removed += history.duplicates_removed;

    for (const candle of history.candles) {
      if (byDate.has(candle.date)) {
        merged.duplicates_removed += 1;
      }
      byDate.set(candle.date, candle);
    }
  }

  merged.candles = [...byDate.values()].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );

  return merged;
}

// --------------------------------------------------
// Asset input
// --------------------------------------------------

/**
 * Combines provider identity with curated classification.
 *
 * `assets.symbol` is the provider symbol because inventing a canonical ticker
 * (`XAU`, `CL`, ...) for a futures contract would assert a mapping the provider
 * never made. The provider symbol is the stable, verified identity.
 */
export function buildCommodityAssetInput(identity: CommodityIdentity): CommodityAssetInput {
  const reference = findCommodityReference(identity.symbol);

  return {
    symbol: identity.symbol,
    name: identity.provider_name ?? reference?.display_name ?? identity.symbol,
    commodity_type: reference?.commodity_type ?? null,
    benchmark: reference?.benchmark ?? null,
    currency: identity.currency,
    provider_symbol: identity.symbol,
    provider_name: identity.provider_name,
    exchange: identity.exchange,
    trade_month: identity.trade_month,
  };
}
