import "dotenv/config";

import {
  fetchCommodityCatalog,
  findListedCommodity,
  type CommodityListSnapshot,
  type CommodityIdentity,
} from "../../collectors/assets/commodities/fmpCommodityFetchers.js";
import { findCommodityReference, DEFAULT_COMMODITY_SYMBOLS } from "../../collectors/assets/commodities/commodityReference.js";
import type {
  CommodityIdentity,
  CommodityResolutionResult,
  CommoditySearchCandidate,
} from "../../types/commodities/commodity.types.js";

/* -------------------------------------------------------------------------- */
/*                              FMP Catalog Cache                             */
/* -------------------------------------------------------------------------- */

let commodityCatalogCache: CommodityListSnapshot | null = null;
let commodityCatalogFetchedAt: string | null = null;
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getCommodityCatalog(): Promise<CommodityListSnapshot> {
  const now = Date.now();
  if (
    commodityCatalogCache &&
    commodityCatalogFetchedAt &&
    now - Date.parse(commodityCatalogFetchedAt) < CATALOG_TTL_MS
  ) {
    return commodityCatalogCache;
  }

  const result = await fetchCommodityCatalog();
  commodityCatalogCache = result.snapshot;
  commodityCatalogFetchedAt = result.snapshot.fetched_at;
  return commodityCatalogCache;
}

function invalidateCommodityCatalog(): void {
  commodityCatalogCache = null;
  commodityCatalogFetchedAt = null;
}

/* -------------------------------------------------------------------------- */
/*                              Normalization                                 */
/* -------------------------------------------------------------------------- */

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function buildProviderIds(symbol: string, currency: string | null): Record<string, Record<string, unknown>> {
  return {
    fmp: {
      symbol,
      currency,
    },
  };
}

function identityFromListed(
  listed: CommodityIdentity,
  reference: ReturnType<typeof findCommodityReference>,
): CommodityIdentity {
  return {
    assetId: "",
    symbol: listed.symbol,
    name: listed.providerName ?? reference?.display_name ?? listed.symbol,
    commodityType: reference?.commodity_type ?? null,
    benchmark: reference?.benchmark ?? null,
    currency: listed.currency,
    providerIds: buildProviderIds(listed.symbol, listed.currency),
  };
}

/* -------------------------------------------------------------------------- */
/*                              Resolution Logic                              */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a commodity by exact FMP symbol.
 */
export async function resolveBySymbol(symbol: string): Promise<CommodityResolutionResult> {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    return { kind: "not_found", message: "Empty symbol." };
  }

  const catalog = await getCommodityCatalog();
  const listed = findListedCommodity(catalog, normalized);

  if (!listed) {
    return { kind: "not_found", message: `Commodity symbol not found: ${normalized}` };
  }

  const reference = findCommodityReference(normalized);
  return { kind: "resolved", identity: identityFromListed(listed, reference) };
}

/**
 * Resolves a commodity by name using the curated reference table.
 */
export async function resolveByName(name: string): Promise<CommodityResolutionResult> {
  const normalized = name.trim();
  if (!normalized) {
    return { kind: "not_found", message: "Empty name." };
  }

  const catalog = await getCommodityCatalog();
  const lowerNormalized = normalized.toLowerCase();

  // Try exact match in curated references first
  for (const ref of DEFAULT_COMMODITY_SYMBOLS) {
    const reference = findCommodityReference(ref);
    if (reference?.display_name.toLowerCase() === lowerNormalized) {
      const listed = findListedCommodity(catalog, ref);
      if (listed) {
        return { kind: "resolved", identity: identityFromListed(listed, reference) };
      }
    }
  }

  // Try fuzzy match in provider names
  const nameMatches = catalog.commodities.filter(
    (c) => c.providerName?.toLowerCase().includes(lowerNormalized),
  );

  if (nameMatches.length === 1) {
    const reference = findCommodityReference(nameMatches[0].symbol);
    return { kind: "resolved", identity: identityFromListed(nameMatches[0], reference) };
  }

  if (nameMatches.length > 1) {
    const identities = nameMatches.map((m) => identityFromListed(m, findCommodityReference(m.symbol)));
    return {
      kind: "ambiguous",
      candidates: identities,
      message: `Name "${normalized}" matches ${identities.length} commodities.`,
    };
  }

  // Try fuzzy match in curated display names
  const displayMatches = DEFAULT_COMMODITY_SYMBOLS.filter((s) => {
    const ref = findCommodityReference(s);
    return ref?.display_name.toLowerCase().includes(lowerNormalized);
  });

  if (displayMatches.length === 1) {
    const reference = findCommodityReference(displayMatches[0]);
    const listed = findListedCommodity(catalog, displayMatches[0]);
    if (listed) {
      return { kind: "resolved", identity: identityFromListed(listed, reference) };
    }
  }

  if (displayMatches.length > 1) {
    const identities = displayMatches.map((s) => {
      const ref = findCommodityReference(s)!;
      const listed = findListedCommodity(catalog, s);
      return listed ? identityFromListed(listed, ref) : {
        assetId: "",
        symbol: s,
        name: ref.display_name,
        commodityType: ref.commodity_type,
        benchmark: ref.benchmark,
        currency: null,
        providerIds: buildProviderIds(s, null),
      };
    });
    return {
      kind: "ambiguous",
      candidates: identities,
      message: `Query "${normalized}" matches ${identities.length} commodities.`,
    };
  }

  return { kind: "not_found", message: `No commodity found matching: ${normalized}` };
}

/**
 * Main resolution entry point.
 * Tries symbol first (for exact FMP symbols like GCUSD), then name.
 */
export async function resolveCommodity(query: string): Promise<CommodityResolutionResult> {
  const trimmed = query.trim();

  if (!trimmed) {
    return { kind: "not_found", message: "Empty query." };
  }

  // Heuristic: if it looks like an FMP symbol (uppercase, contains USD or similar pattern), try symbol first
  const looksLikeSymbol = /^[A-Z]{2,6}USD$/.test(trimmed.toUpperCase()) || /^[A-Z]{2,10}$/.test(trimmed.toUpperCase());

  if (looksLikeSymbol) {
    const symbolResult = await resolveBySymbol(trimmed);
    if (symbolResult.kind === "resolved" || symbolResult.kind === "ambiguous") {
      return symbolResult;
    }
    // Fall through to name search
  }

  return resolveByName(trimmed);
}

/* -------------------------------------------------------------------------- */
/*                              Search/Autocomplete                           */
/* -------------------------------------------------------------------------- */

export async function searchCommodities(query: string, limit = 10): Promise<CommoditySearchCandidate[]> {
  const normalized = query.trim();
  if (!normalized) {
    return [];
  }

  const catalog = await getCommodityCatalog();
  const lowerQuery = normalized.toLowerCase();
  const results: CommoditySearchCandidate[] = [];

  // Exact symbol match first
  const exactSymbol = catalog.commodities.find((c) => c.symbol.toLowerCase() === lowerQuery);
  if (exactSymbol) {
    const ref = findCommodityReference(exactSymbol.symbol);
    results.push({
      symbol: exactSymbol.symbol,
      name: exactSymbol.providerName ?? ref?.display_name ?? exactSymbol.symbol,
      commodityType: ref?.commodity_type ?? null,
      benchmark: ref?.benchmark ?? null,
      currency: exactSymbol.currency,
      provider: "FMP",
    });
  }

  // Prefix symbol matches
  if (results.length < limit) {
    for (const c of catalog.commodities) {
      if (results.length >= limit) break;
      if (c.symbol.toLowerCase().startsWith(lowerQuery)) {
        const ref = findCommodityReference(c.symbol);
        if (!results.some((r) => r.symbol === c.symbol)) {
          results.push({
            symbol: c.symbol,
            name: c.providerName ?? ref?.display_name ?? c.symbol,
            commodityType: ref?.commodity_type ?? null,
            benchmark: ref?.benchmark ?? null,
            currency: c.currency,
            provider: "FMP",
          });
        }
      }
    }
  }

  // Name prefix matches in provider names
  if (results.length < limit) {
    for (const c of catalog.commodities) {
      if (results.length >= limit) break;
      if (c.providerName?.toLowerCase().startsWith(lowerQuery)) {
        const ref = findCommodityReference(c.symbol);
        if (!results.some((r) => r.symbol === c.symbol)) {
          results.push({
            symbol: c.symbol,
            name: c.providerName ?? ref?.display_name ?? c.symbol,
            commodityType: ref?.commodity_type ?? null,
            benchmark: ref?.benchmark ?? null,
            currency: c.currency,
            provider: "FMP",
          });
        }
      }
    }
  }

  // Curated display name matches
  if (results.length < limit) {
    for (const s of DEFAULT_COMMODITY_SYMBOLS) {
      if (results.length >= limit) break;
      const ref = findCommodityReference(s);
      if (ref?.display_name.toLowerCase().includes(lowerQuery)) {
        const listed = findListedCommodity(catalog, s);
        if (listed && !results.some((r) => r.symbol === s)) {
          results.push({
            symbol: s,
            name: ref.display_name,
            commodityType: ref.commodity_type,
            benchmark: ref.benchmark,
            currency: listed.currency,
            provider: "FMP",
          });
        }
      }
    }
  }

  return results.slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/*                              Cache Invalidation                            */
/* -------------------------------------------------------------------------- */

export function invalidateCommodityCache(): void {
  invalidateCommodityCatalog();
}