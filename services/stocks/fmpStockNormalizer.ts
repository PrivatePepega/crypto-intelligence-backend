import {
  fmpProfileItemSchema,
  fmpQuoteItemSchema,
  fmpSearchSymbolItemSchema,
  fmpSearchNameItemSchema,
  fmpHistoricalPriceEodItemSchema,
  type FmpProfileItem,
  type FmpQuoteItem,
  type FmpSearchSymbolItem,
  type FmpSearchNameItem,
  type FmpHistoricalPriceEodItem,
} from "../../types/stocks/stock.types.js";
import type {
  StockProfile,
  StockQuote,
  StockHistory,
  StockCandle,
  StockIdentity,
} from "../../types/stocks/stock.types.js";

// Re-export types for consumers
export type { StockProfile, StockQuote, StockHistory, StockCandle };

/* -------------------------------------------------------------------------- */
/*                              Helpers                                       */
/* -------------------------------------------------------------------------- */

const MIN_YEAR = 1970;
const MAX_YEAR = 2100;
const MIN_QUOTE_UNIX_SECONDS = 946_684_800; // 2000-01-01
const MAX_QUOTE_UNIX_SECONDS = 4_102_444_800; // 2100-01-01

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeOrNull(value: unknown): number | null {
  const parsed = finiteOrNull(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function trimmedString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, maxLength);
}

export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : null;
}

export function parseProviderDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < MIN_YEAR || year > MAX_YEAR) return null;

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

export function providerDateToTimestamp(date: string): string {
  const parsed = parseProviderDate(date);
  if (!parsed) throw new Error(`Invalid provider date: ${date}`);
  return `${parsed}T00:00:00.000Z`;
}

export function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }
  if (value < MIN_QUOTE_UNIX_SECONDS || value > MAX_QUOTE_UNIX_SECONDS) {
    return null;
  }
  return new Date(value * 1_000).toISOString();
}

function validateOhcl(open: number, high: number, low: number, close: number): boolean {
  if (high < low) return false;
  if (open > high || open < low) return false;
  if (close > high || close < low) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/*                              Profile                                       */
/* -------------------------------------------------------------------------- */

export type NormalizedProfileResult =
  | { ok: true; profile: StockProfile }
  | { ok: false; reason: string };

/**
 * Normalizes FMP profile data into our canonical StockProfile.
 * Does not persist; pure transformation.
 */
export function normalizeStockProfile(
  raw: unknown,
  identity: StockIdentity,
  options: { collectedAt: string } = { collectedAt: new Date().toISOString() },
): NormalizedProfileResult {
  const parsed = fmpProfileItemSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `profile failed validation${issue ? `: ${issue.path.join(".")} ${issue.message}` : ""}`,
    };
  }

  const data = parsed.data;

  // Reject ETFs/funds unless explicitly configured otherwise
  if (data.isEtf === true || data.isFund === true) {
    return { ok: false, reason: "Asset is an ETF/fund, not a company stock." };
  }

  const profile: StockProfile = {
    assetId: identity.assetId,
    ticker: identity.ticker,
    companyName: trimmedString(data.companyName) ?? identity.companyName,
    exchange: trimmedString(data.exchange) ?? identity.exchange,
    cik: data.cik ? data.cik.padStart(10, "0") : identity.cik,
    isin: trimmedString(data.isin),
    cusip: trimmedString(data.cusip),
    sector: trimmedString(data.sector),
    industry: trimmedString(data.industry),
    description: trimmedString(data.description, 5000),
    website: trimmedString(data.website),
    country: trimmedString(data.country),
    ipoDate: parseProviderDate(data.ipoDate),
    currency: normalizeCurrency(data.currency),
    isEtf: data.isEtf ?? null,
    isFund: data.isFund ?? null,
    isAdr: data.isAdr ?? null,
    isActivelyTrading: data.isActivelyTrading ?? null,
    providerData: data,
    updatedAt: options.collectedAt,
  };

  return { ok: true, profile };
}

/* -------------------------------------------------------------------------- */
/*                              Quote                                         */
/* -------------------------------------------------------------------------- */

export type NormalizedQuoteResult =
  | { ok: true; quote: StockQuote }
  | { ok: false; reason: string };

/**
 * Normalizes a single FMP quote response row.
 */
export function normalizeStockQuote(
  raw: unknown,
  options: { symbol: string; currency: string | null; collectedAt: string } = {
    symbol: "",
    currency: null,
    collectedAt: new Date().toISOString(),
  },
): NormalizedQuoteResult {
  const parsed = fmpQuoteItemSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `quote failed validation${issue ? `: ${issue.path.join(".")} ${issue.message}` : ""}`,
    };
  }

  const data = parsed.data;
  const expectedSymbol = options.symbol.trim().toUpperCase();
  const providerSymbol = data.symbol.trim().toUpperCase();

  if (providerSymbol !== expectedSymbol) {
    return {
      ok: false,
      reason: `provider returned symbol ${providerSymbol} for requested ${expectedSymbol}`,
    };
  }

  const price = finiteOrNull(data.price);
  if (price === null) {
    return { ok: false, reason: "quote has no finite price" };
  }

  const quote: StockQuote = {
    provider: "fmp",
    symbol: expectedSymbol,
    providerSymbol: providerSymbol,
    name: trimmedString(data.name) ?? expectedSymbol,
    currency: normalizeCurrency(options.currency) ?? normalizeCurrency(data.currency),
    price,
    change: finiteOrNull(data.change),
    changePercent: finiteOrNull(data.changePercentage),
    open: finiteOrNull(data.open),
    previousClose: finiteOrNull(data.previousClose),
    dayLow: finiteOrNull(data.dayLow),
    dayHigh: finiteOrNull(data.dayHigh),
    yearLow: finiteOrNull(data.yearLow),
    yearHigh: finiteOrNull(data.yearHigh),
    volume: nonNegativeOrNull(data.volume),
    averageVolume: nonNegativeOrNull(data.averageVolume),
    marketCap: nonNegativeOrNull(data.marketCap),
    priceAvg50: finiteOrNull(data.priceAvg50),
    priceAvg200: finiteOrNull(data.priceAvg200),
    exchange: trimmedString(data.exchange),
    observedAt: unixSecondsToIso(data.timestamp),
    collectedAt: options.collectedAt,
    providerRaw: data,
  };

  return { ok: true, quote };
}

/* -------------------------------------------------------------------------- */
/*                              Historical Price                              */
/* -------------------------------------------------------------------------- */

export interface StockHistoryInput {
  symbol: string;
  fetchedAt: string;
  requested: { from: string | null; to: string | null };
}

/**
 * Normalizes FMP historical price EOD rows into StockCandle array.
 * Deduplicates by trading date, sorts oldest-first.
 */
export function normalizeStockHistory(
  raw: unknown,
  input: StockHistoryInput,
): StockHistory {
  const history: StockHistory = {
    provider: "fmp",
    symbol: input.symbol.trim().toUpperCase(),
    interval: "1d",
    fetchedAt: input.fetchedAt,
    requested: input.requested,
    candles: [],
    rejected: [],
    duplicatesRemoved: 0,
  };

  if (!Array.isArray(raw)) {
    history.rejected.push({ date: null, reason: "response was not an array" });
    return history;
  }

  const byDate = new Map<string, StockCandle>();

  for (const row of raw) {
    const parsed = fmpHistoricalPriceEodItemSchema.safeParse(row);
    if (!parsed.success) {
      const dateGuess =
        row && typeof row === "object" && "date" in row
          ? String((row as Record<string, unknown>)["date"]).slice(0, 20)
          : null;
      history.rejected.push({ date: dateGuess, reason: "row failed validation" });
      continue;
    }

    const data = parsed.data;
    if (data.symbol.trim().toUpperCase() !== history.symbol) {
      history.rejected.push({
        date: data.date,
        reason: `row belongs to symbol ${data.symbol.trim().toUpperCase()}`,
      });
      continue;
    }

    const date = parseProviderDate(data.date);
    if (!date) {
      history.rejected.push({ date: data.date, reason: "invalid trading date" });
      continue;
    }

    const open = finiteOrNull(data.open);
    const high = finiteOrNull(data.high);
    const low = finiteOrNull(data.low);
    const close = finiteOrNull(data.close);

    if (open === null || high === null || low === null || close === null) {
      history.rejected.push({ date, reason: "non-finite OHLC value" });
      continue;
    }

    if (!validateOhcl(open, high, low, close)) {
      history.rejected.push({ date, reason: "OHLC range violation" });
      continue;
    }

    const candle: StockCandle = {
      symbol: history.symbol,
      date,
      timestamp: providerDateToTimestamp(date),
      open,
      high,
      low,
      close,
      volume: nonNegativeOrNull(data.volume),
      change: finiteOrNull(data.change),
      changePercent: finiteOrNull(data.changePercent),
      vwap: finiteOrNull(data.vwap),
    };

    if (byDate.has(candle.date)) {
      history.duplicatesRemoved += 1;
    }
    byDate.set(candle.date, candle);
  }

  history.candles = [...byDate.values()].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );

  return history;
}

/**
 * Merges multiple history windows for the same symbol.
 */
export function mergeStockHistories(
  symbol: string,
  fetchedAt: string,
  requested: { from: string | null; to: string | null },
  histories: StockHistory[],
): StockHistory {
  const merged: StockHistory = {
    provider: "fmp",
    symbol: symbol.trim().toUpperCase(),
    interval: "1d",
    fetchedAt: fetchedAt,
    requested,
    candles: [],
    rejected: [],
    duplicatesRemoved: 0,
  };

  const byDate = new Map<string, StockCandle>();

  for (const history of histories) {
    merged.rejected.push(...history.rejected);
    merged.duplicatesRemoved += history.duplicatesRemoved;

    for (const candle of history.candles) {
      if (byDate.has(candle.date)) {
        merged.duplicatesRemoved += 1;
      }
      byDate.set(candle.date, candle);
    }
  }

  merged.candles = [...byDate.values()].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );

  return merged;
}

/* -------------------------------------------------------------------------- */
/*                              Snapshot Key                                  */
/* -------------------------------------------------------------------------- */

/**
 * Builds a stable key for idempotent quote snapshots.
 * Key format: fmp:<providerSymbol>:<observedAt>
 */
export function buildQuoteSnapshotKey(quote: StockQuote): string {
  return `fmp:${quote.providerSymbol}:${quote.observedAt ?? quote.collectedAt}`;
}

/**
 * Builds the assets.information.data payload for a quote observation.
 */
export function buildQuoteSnapshotData(quote: StockQuote): Record<string, unknown> {
  return {
    provider: quote.provider,
    providerSymbol: quote.providerSymbol,
    snapshotKey: buildQuoteSnapshotKey(quote),
    name: quote.name,
    currency: quote.currency,
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    open: quote.open,
    previousClose: quote.previousClose,
    dayLow: quote.dayLow,
    dayHigh: quote.dayHigh,
    yearLow: quote.yearLow,
    yearHigh: quote.yearHigh,
    volume: quote.volume,
    averageVolume: quote.averageVolume,
    marketCap: quote.marketCap,
    priceAvg50: quote.priceAvg50,
    priceAvg200: quote.priceAvg200,
    exchange: quote.exchange,
    observedAt: quote.observedAt,
    collectedAt: quote.collectedAt,
    limitations: [
      "Provider-reported quote; not independently verified.",
      "Volume is the provider's reported volume with no documented unit.",
      "A quote is an observation, not a daily candle.",
    ],
  };
}