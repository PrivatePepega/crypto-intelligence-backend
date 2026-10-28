import "dotenv/config";

import {
  fmpGet,
  FmpRequestError,
  type FmpFailureKind,
} from "../../collectors/assets/commodities/fmpClient.js";
import {
  loadCompanyTickersExchange,
  padCik,
  type SecTickerExchangeData,
} from "../../collectors/assets/stocks/secEdgarFetch.js";
import type {
  FmpSearchSymbolItem,
  FmpSearchNameItem,
  FmpProfileItem,
  StockIdentity,
  StockResolutionResult,
  StockSearchCandidate,
} from "../../types/stocks/stock.types.js";

export const FMP_BASE_URL = "https://financialmodelingprep.com/stable";
export const SEARCH_SYMBOL_ENDPOINT = "/search-symbol";
export const SEARCH_NAME_ENDPOINT = "/search-name";
export const PROFILE_ENDPOINT = "/profile";
export const QUOTE_ENDPOINT = "/quote";
export const HISTORY_ENDPOINT = "/historical-price-eod/full";

/* -------------------------------------------------------------------------- */
/*                              SEC Ticker Cache                              */
/* -------------------------------------------------------------------------- */

let secTickerCache: Map<string, SecTickerExchangeData> | null = null;

async function getSecTickerData(): Promise<SecTickerExchangeData> {
  if (secTickerCache) {
    return secTickerCache;
  }
  const data = await loadCompanyTickersExchange();
  secTickerCache = new Map([[data.fields.join("|"), data]]);
  return data;
}

/** Builds a lookup from ticker (uppercase) to SEC records. */
function buildSecTickerIndex(data: SecTickerExchangeData): Map<string, SecTickerExchangeRow[]> {
  const index = new Map<string, SecTickerExchangeRow[]>();
  for (const row of data.data) {
    const ticker = row[2].toUpperCase();
    const existing = index.get(ticker) ?? [];
    existing.push(row);
    index.set(ticker, existing);
  }
  return index;
}

/** Builds a lookup from CIK to SEC record. */
function buildSecCikIndex(data: SecTickerExchangeData): Map<string, SecTickerExchangeRow> {
  const index = new Map<string, SecTickerExchangeRow>();
  for (const row of data.data) {
    const cik = padCik(row[0]);
    index.set(cik, row);
  }
  return index;
}

/** Builds a lookup from company name (lowercase) to SEC records. */
function buildSecNameIndex(data: SecTickerExchangeData): Map<string, SecTickerExchangeRow[]> {
  const index = new Map<string, SecTickerExchangeRow[]>();
  for (const row of data.data) {
    const name = row[1].toLowerCase().trim();
    const existing = index.get(name) ?? [];
    existing.push(row);
    index.set(name, existing);
  }
  return index;
}

/* -------------------------------------------------------------------------- */
/*                              FMP Search                                    */
/* -------------------------------------------------------------------------- */

async function fmpSearchSymbol(query: string): Promise<FmpSearchSymbolItem[]> {
  const result = await fmpGet(SEARCH_SYMBOL_ENDPOINT, { query }, `search-symbol ${query}`);
  if (!Array.isArray(result.data)) {
    return [];
  }
  return result.data as FmpSearchSymbolItem[];
}

async function fmpSearchName(query: string): Promise<FmpSearchNameItem[]> {
  const result = await fmpGet(SEARCH_NAME_ENDPOINT, { query }, `search-name ${query}`);
  if (!Array.isArray(result.data)) {
    return [];
  }
  return result.data as FmpSearchNameItem[];
}

async function fmpGetProfile(symbol: string): Promise<FmpProfileItem | null> {
  try {
    const result = await fmpGet(PROFILE_ENDPOINT, { symbol }, `profile ${symbol}`);
    if (!Array.isArray(result.data) || result.data.length === 0) {
      return null;
    }
    return result.data[0] as FmpProfileItem;
  } catch (error) {
    if (error instanceof FmpRequestError && error.kind === "restricted") {
      return null; // plan restriction, not an error
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                              Normalization                                 */
/* -------------------------------------------------------------------------- */

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeName(value: string): string {
  return value.trim();
}

function buildProviderIds(
  fmpSymbol: string | null,
  fmpProfile: FmpProfileItem | null,
  secRecord: SecTickerExchangeRow | null,
): Record<string, Record<string, unknown>> {
  const ids: Record<string, Record<string, unknown>> = {};

  if (fmpSymbol || fmpProfile) {
    ids.fmp = {
      symbol: fmpSymbol,
      cik: fmpProfile?.cik ?? null,
      isin: fmpProfile?.isin ?? null,
      cusip: fmpProfile?.cusip ?? null,
    };
  }

  if (secRecord) {
    ids.sec = {
      cik: padCik(secRecord[0]),
      name: secRecord[1],
      ticker: secRecord[2],
      exchange: secRecord[3],
    };
  }

  return ids;
}

function secRowToIdentity(
  secRow: SecTickerExchangeRow,
  fmpProfile: FmpProfileItem | null,
): StockIdentity {
  const cik = padCik(secRow[0]);
  const ticker = secRow[2];
  const companyName = secRow[1];
  const exchange = secRow[3] ?? fmpProfile?.exchange ?? null;

  return {
    assetId: "", // Will be filled after DB lookup/creation
    ticker,
    companyName,
    exchange,
    cik,
    providerIds: buildProviderIds(ticker, fmpProfile, secRow),
  };
}

function fmpSearchToCandidate(item: FmpSearchSymbolItem | FmpSearchNameItem, provider: "fmp"): StockSearchCandidate {
  return {
    ticker: item.symbol.toUpperCase(),
    companyName: item.name ?? item.symbol,
    exchange: item.exchange ?? null,
    cik: null,
    provider,
    providerSymbol: item.symbol.toUpperCase(),
  };
}

/* -------------------------------------------------------------------------- */
/*                              Resolution Logic                              */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a ticker symbol to a canonical stock identity.
 * Uses FMP profile for canonical data, falls back to SEC for CIK.
 */
export async function resolveByTicker(ticker: string): Promise<StockResolutionResult> {
  const normalized = normalizeTicker(ticker);

  // 1. Try FMP profile first (most complete data)
  const fmpProfile = await fmpGetProfile(normalized);

  // 2. Get SEC ticker data for CIK validation
  const secData = await getSecTickerData();
  const secTickerIndex = buildSecTickerIndex(secData);
  const secMatches = secTickerIndex.get(normalized) ?? [];

  if (fmpProfile) {
    // FMP has this symbol - use its canonical data
    const secMatch = secMatches.find((row) => row[1].toLowerCase().includes(fmpProfile.companyName?.toLowerCase() ?? ""))
      ?? secMatches[0] ?? null;

    const identity = secMatch
      ? secRowToIdentity(secMatch, fmpProfile)
      : {
          assetId: "",
          ticker: fmpProfile.symbol,
          companyName: fmpProfile.companyName ?? fmpProfile.symbol,
          exchange: fmpProfile.exchange ?? null,
          cik: fmpProfile.cik ? padCik(fmpProfile.cik) : null,
          providerIds: buildProviderIds(fmpProfile.symbol, fmpProfile, null),
        };

    // Validate it's a stock (not ETF/fund) unless explicitly allowed
    if (fmpProfile.isEtf === true || fmpProfile.isFund === true) {
      return {
        kind: "not_found",
        message: `${normalized} is an ETF/fund, not a company stock.`,
      };
    }

    return { kind: "resolved", identity };
  }

  // No FMP profile, but SEC has it
  if (secMatches.length > 0) {
    if (secMatches.length > 1) {
      const candidates = secMatches.map((row) => secRowToIdentity(row, null));
      return {
        kind: "ambiguous",
        candidates,
        message: `${normalized} matches ${secMatches.length} SEC listings.`,
      };
    }
    return { kind: "resolved", identity: secRowToIdentity(secMatches[0], null) };
  }

  // Not found in either source
  return {
    kind: "not_found",
    message: `This is not a recognized stock: ${normalized}`,
  };
}

/**
 * Resolves a company name to a canonical stock identity.
 */
export async function resolveByName(name: string): Promise<StockResolutionResult> {
  const normalized = normalizeName(name);

  // 1. Try FMP search by name
  const fmpResults = await fmpSearchName(normalized);
  const exactFmpMatches = fmpResults.filter(
    (item) => item.name?.toLowerCase().trim() === normalized.toLowerCase(),
  );

  // 2. Get SEC data
  const secData = await getSecTickerData();
  const secNameIndex = buildSecNameIndex(secData);
  const secMatches = secNameIndex.get(normalized.toLowerCase()) ?? [];

  // 3. Cross-reference FMP and SEC
  if (exactFmpMatches.length === 1 && secMatches.length === 1) {
    const fmpItem = exactFmpMatches[0];
    const secRow = secMatches[0];
    const fmpProfile = await fmpGetProfile(fmpItem.symbol);

    if (fmpProfile?.isEtf === true || fmpProfile?.isFund === true) {
      return {
        kind: "not_found",
        message: `${fmpItem.symbol} is an ETF/fund, not a company stock.`,
      };
    }

    return {
      kind: "resolved",
      identity: secRowToIdentity(secRow, fmpProfile),
    };
  }

  if (exactFmpMatches.length === 1) {
    const fmpItem = exactFmpMatches[0];
    const fmpProfile = await fmpGetProfile(fmpItem.symbol);

    if (fmpProfile?.isEtf === true || fmpProfile?.isFund === true) {
      return {
        kind: "not_found",
        message: `${fmpItem.symbol} is an ETF/fund, not a company stock.`,
      };
    }

    return {
      kind: "resolved",
      identity: {
        assetId: "",
        ticker: fmpProfile?.symbol ?? fmpItem.symbol,
        companyName: fmpProfile?.companyName ?? fmpItem.name ?? fmpItem.symbol,
        exchange: fmpProfile?.exchange ?? fmpItem.exchange ?? null,
        cik: fmpProfile?.cik ? padCik(fmpProfile.cik) : null,
        providerIds: buildProviderIds(fmpItem.symbol, fmpProfile, null),
      },
    };
  }

  if (secMatches.length === 1) {
    return { kind: "resolved", identity: secRowToIdentity(secMatches[0], null) };
  }

  if (secMatches.length > 1 || exactFmpMatches.length > 1) {
    const candidates: StockIdentity[] = [];
    for (const row of secMatches) {
      candidates.push(secRowToIdentity(row, null));
    }
    for (const item of exactFmpMatches) {
      const fmpProfile = await fmpGetProfile(item.symbol);
      if (fmpProfile?.isEtf !== true && fmpProfile?.isFund !== true) {
        candidates.push({
          assetId: "",
          ticker: fmpProfile?.symbol ?? item.symbol,
          companyName: fmpProfile?.companyName ?? item.name ?? item.symbol,
          exchange: fmpProfile?.exchange ?? item.exchange ?? null,
          cik: fmpProfile?.cik ? padCik(fmpProfile.cik) : null,
          providerIds: buildProviderIds(item.symbol, fmpProfile, null),
        });
      }
    }
    return {
      kind: "ambiguous",
      candidates,
      message: `"${normalized}" matches multiple companies.`,
    };
  }

  // Try fuzzy FMP matches
  const fuzzyFmpMatches = fmpResults.filter(
    (item) => item.name?.toLowerCase().includes(normalized.toLowerCase()),
  );

  if (fuzzyFmpMatches.length === 1) {
    const fmpProfile = await fmpGetProfile(fuzzyFmpMatches[0].symbol);
    if (fmpProfile?.isEtf !== true && fmpProfile?.isFund !== true) {
      return {
        kind: "resolved",
        identity: {
          assetId: "",
          ticker: fmpProfile?.symbol ?? fuzzyFmpMatches[0].symbol,
          companyName: fmpProfile?.companyName ?? fuzzyFmpMatches[0].name ?? fuzzyFmpMatches[0].symbol,
          exchange: fmpProfile?.exchange ?? fuzzyFmpMatches[0].exchange ?? null,
          cik: fmpProfile?.cik ? padCik(fmpProfile.cik) : null,
          providerIds: buildProviderIds(fuzzyFmpMatches[0].symbol, fmpProfile, null),
        },
      };
    }
  }

  return {
    kind: "not_found",
    message: `This is not a recognized stock: ${normalized}`,
  };
}

/**
 * Autocomplete/search for stock tickers or company names.
 * Lightweight - does not trigger full profile fetches.
 */
export async function searchStocks(query: string, limit = 10): Promise<StockSearchCandidate[]> {
  const normalized = normalizeName(query);
  const results: StockSearchCandidate[] = [];

  // FMP symbol search (fast, prefix match)
  const fmpSymbolResults = await fmpSearchSymbol(normalized);
  for (const item of fmpSymbolResults.slice(0, limit)) {
    results.push(fmpSearchToCandidate(item, "fmp"));
  }

  // FMP name search
  if (results.length < limit) {
    const fmpNameResults = await fmpSearchName(normalized);
    for (const item of fmpNameResults.slice(0, limit - results.length)) {
      const candidate = fmpSearchToCandidate(item, "fmp");
      if (!results.some((r) => r.ticker === candidate.ticker)) {
        results.push(candidate);
      }
    }
  }

  // SEC ticker exchange (authoritative for US listings)
  if (results.length < limit) {
    const secData = await getSecTickerData();
    const secTickerIndex = buildSecTickerIndex(secData);
    const secNameIndex = buildSecNameIndex(secData);

    // Exact ticker match in SEC
    const secTickerMatches = secTickerIndex.get(normalized.toUpperCase()) ?? [];
    for (const row of secTickerMatches.slice(0, limit - results.length)) {
      const candidate: StockSearchCandidate = {
        ticker: row[2],
        companyName: row[1],
        exchange: row[3],
        cik: padCik(row[0]),
        provider: "sec",
        providerSymbol: row[2],
      };
      if (!results.some((r) => r.ticker === candidate.ticker)) {
        results.push(candidate);
      }
    }

    // Name prefix match in SEC
    if (results.length < limit) {
      for (const [name, rows] of secNameIndex) {
        if (name.startsWith(normalized.toLowerCase())) {
          for (const row of rows) {
            if (results.length >= limit) break;
            const candidate: StockSearchCandidate = {
              ticker: row[2],
              companyName: row[1],
              exchange: row[3],
              cik: padCik(row[0]),
              provider: "sec",
              providerSymbol: row[2],
            };
            if (!results.some((r) => r.ticker === candidate.ticker)) {
              results.push(candidate);
            }
          }
        }
        if (results.length >= limit) break;
      }
    }
  }

  return results.slice(0, limit);
}

/**
 * Main resolution entry point.
 * Tries ticker first, then company name.
 */
export async function resolveStock(query: string): Promise<StockResolutionResult> {
  const trimmed = query.trim();

  if (!trimmed) {
    return { kind: "not_found", message: "Empty query." };
  }

  // Heuristic: if it looks like a ticker (short, alphanumeric, maybe with dots), try ticker first
  const looksLikeTicker = /^[A-Z0-9.\-]{1,10}$/i.test(trimmed) && !trimmed.includes(" ");

  if (looksLikeTicker) {
    const tickerResult = await resolveByTicker(trimmed);
    if (tickerResult.kind === "resolved" || tickerResult.kind === "ambiguous") {
      return tickerResult;
    }
    // Fall through to name search
  }

  return resolveByName(trimmed);
}

/* -------------------------------------------------------------------------- */
/*                              Cache Invalidation                            */
/* -------------------------------------------------------------------------- */

export function invalidateSecCache(): void {
  secTickerCache = null;
}