import "dotenv/config";

import {
  searchCoinGecko,
  fetchCoinGeckoCoin,
  fetchCoinGeckoCoinsList,
  normalizeCoinsList,
  normalizeSearchCandidates,
  type CoinGeckoSearchCandidate,
  type CoinGeckoCoinListEntry,
  type CoinGeckoAssetProfile,
} from "../../collectors/assets/crypto/coingeckoFetchers.js";
import {
  normalizeAlchemyNetwork,
  getAlchemyChainId,
  getExplorerTokenUrl,
  normalizeEvmAddress,
  type AlchemyNetwork,
} from "../../collectors/assets/crypto/alchemyFetchers.js";
import type {
  CryptoIdentity,
  CryptoResolutionResult,
  CryptoSearchCandidate,
  CryptoDeployment,
} from "../../types/crypto/crypto.types.js";

/* -------------------------------------------------------------------------- */
/*                              CoinGecko Cache                               */
/* -------------------------------------------------------------------------- */

let coinGeckoCatalogCache: CoinGeckoCoinListEntry[] | null = null;
let coinGeckoCatalogFetchedAt: string | null = null;
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getCoinGeckoCatalog(): Promise<CoinGeckoCoinListEntry[]> {
  const now = Date.now();
  if (
    coinGeckoCatalogCache &&
    coinGeckoCatalogFetchedAt &&
    now - Date.parse(coinGeckoCatalogFetchedAt) < CATALOG_TTL_MS
  ) {
    return coinGeckoCatalogCache;
  }

  const report = await fetchCoinGeckoCoinsList({ includePlatforms: true });
  coinGeckoCatalogCache = report.coins;
  coinGeckoCatalogFetchedAt = report.fetchedAt;
  return coinGeckoCatalogCache;
}

function invalidateCoinGeckoCatalog(): void {
  coinGeckoCatalogCache = null;
  coinGeckoCatalogFetchedAt = null;
}

/* -------------------------------------------------------------------------- */
/*                              Normalization                                 */
/* -------------------------------------------------------------------------- */

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeName(value: string): string {
  return value.trim();
}

function normalizeNetwork(value: string): string {
  return value.trim().toLowerCase();
}

function buildDeploymentsFromCoinGecko(
  platforms: Array<{ network: string; address: string }>,
): Record<string, CryptoDeployment> {
  const deployments: Record<string, CryptoDeployment> = {};
  for (const p of platforms) {
    const network = normalizeNetwork(p.network);
    const address = p.address.toLowerCase();
    const isNative = address === "" || address === "native";
    deployments[network] = {
      network,
      chainId: null, // CoinGecko doesn't provide chain IDs
      contractAddress: isNative ? "" : address,
      decimals: null,
      isNative,
      verified: false,
      source: "CoinGecko",
      explorerUrl: isNative ? null : `https://www.coingecko.com/en/coins/${network}/contract/${address}`,
    };
  }
  return deployments;
}

function buildProviderIds(coingeckoId: string | null, alchemyMetadata?: {
  network: string; chainId: number; contractAddress: string; name: string | null; symbol: string | null; decimals: number | null;
}): Record<string, Record<string, unknown>> {
  const ids: Record<string, Record<string, unknown>> = {};
  if (coingeckoId) {
    ids.coingecko = { id: coingeckoId };
  }
  if (alchemyMetadata) {
    ids.alchemy = {
      network: alchemyMetadata.network,
      chainId: alchemyMetadata.chainId,
      contractAddress: alchemyMetadata.contractAddress,
      name: alchemyMetadata.name,
      symbol: alchemyMetadata.symbol,
      decimals: alchemyMetadata.decimals,
    };
  }
  return ids;
}

function candidateToIdentity(
  candidate: CoinGeckoSearchCandidate,
  catalogEntry: CoinGeckoCoinListEntry | null,
): CryptoIdentity {
  const deployments = catalogEntry
    ? buildDeploymentsFromCoinGecko(catalogEntry.platforms)
    : {};

  const primaryNetwork = Object.keys(deployments)[0] ?? null;
  const primaryDeployment = primaryNetwork ? deployments[primaryNetwork] : null;

  return {
    assetId: "",
    symbol: normalizeSymbol(candidate.symbol),
    name: normalizeName(candidate.name),
    network: primaryNetwork,
    coingeckoId: candidate.coingeckoId,
    deployments,
    providerIds: buildProviderIds(candidate.coingeckoId),
  };
}

function profileToIdentity(profile: CoinGeckoAssetProfile): CryptoIdentity {
  const deployments = buildDeploymentsFromCoinGecko(
    profile.crypto.contractAddresses.map((ca) => ({
      network: ca.network,
      address: ca.address,
    })),
  );

  const primaryNetwork = profile.crypto.network ?? Object.keys(deployments)[0] ?? null;

  return {
    assetId: "",
    symbol: normalizeSymbol(profile.asset.symbol),
    name: normalizeName(profile.asset.name),
    network: primaryNetwork,
    coingeckoId: profile.asset.externalIds.coingecko_id,
    deployments,
    providerIds: {
      coingecko: {
        id: profile.asset.externalIds.coingecko_id,
        ...profile.asset.externalIds.other_provider_ids,
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              Resolution Logic                              */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a token by exact CoinGecko ID.
 */
export async function resolveByCoingeckoId(coingeckoId: string): Promise<CryptoResolutionResult> {
  const trimmed = coingeckoId.trim().toLowerCase();
  if (!trimmed) {
    return { kind: "not_found", message: "Empty CoinGecko ID." };
  }

  try {
    const profile = await fetchCoinGeckoCoin(trimmed);
    return { kind: "resolved", identity: profileToIdentity(profile) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("404") || message.includes("not found")) {
      return { kind: "not_found", message: `CoinGecko ID not found: ${trimmed}` };
    }
    throw error;
  }
}

/**
 * Resolves a token by symbol using CoinGecko search + catalog.
 */
export async function resolveBySymbol(symbol: string): Promise<CryptoResolutionResult> {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    return { kind: "not_found", message: "Empty symbol." };
  }

  // Search CoinGecko
  const searchReport = await searchCoinGecko(normalized);
  const candidates = searchReport.candidates;

  // Filter to exact symbol matches
  const exactMatches = candidates.filter((c) => normalizeSymbol(c.symbol) === normalized);

  if (exactMatches.length === 0) {
    return { kind: "not_found", message: `No token found with symbol: ${normalized}` };
  }

  // Get catalog for platform mappings
  const catalog = await getCoinGeckoCatalog();
  const catalogById = new Map(catalog.map((c) => [c.coingeckoId, c]));

  if (exactMatches.length === 1) {
    const candidate = exactMatches[0]!;
    const catalogEntry = catalogById.get(candidate.coingeckoId) ?? null;
    return { kind: "resolved", identity: candidateToIdentity(candidate, catalogEntry) };
  }

  // Multiple exact symbol matches - return ambiguous
  const identities = exactMatches.map((c) => candidateToIdentity(c, catalogById.get(c.coingeckoId) ?? null));
  return {
    kind: "ambiguous",
    candidates: identities,
    message: `Symbol "${normalized}" matches ${identities.length} tokens.`,
  };
}

/**
 * Resolves a token by name using CoinGecko search + catalog.
 */
export async function resolveByName(name: string): Promise<CryptoResolutionResult> {
  const normalized = normalizeName(name);
  if (!normalized) {
    return { kind: "not_found", message: "Empty name." };
  }

  const searchReport = await searchCoinGecko(normalized);
  const candidates = searchReport.candidates;

  // Filter to exact name matches (case-insensitive)
  const exactMatches = candidates.filter(
    (c) => c.name.toLowerCase().trim() === normalized.toLowerCase(),
  );

  const catalog = await getCoinGeckoCatalog();
  const catalogById = new Map(catalog.map((c) => [c.coingeckoId, c]));

  if (exactMatches.length === 1) {
    const candidate = exactMatches[0]!;
    const catalogEntry = catalogById.get(candidate.coingeckoId) ?? null;
    return { kind: "resolved", identity: candidateToIdentity(candidate, catalogEntry) };
  }

  if (exactMatches.length > 1) {
    const identities = exactMatches.map((c) => candidateToIdentity(c, catalogById.get(c.coingeckoId) ?? null));
    return {
      kind: "ambiguous",
      candidates: identities,
      message: `Name "${normalized}" matches ${identities.length} tokens.`,
    };
  }

  // No exact name match - try fuzzy search in catalog
  const lowerNormalized = normalized.toLowerCase();
  const fuzzyCatalogMatches = catalog.filter(
    (c) => c.name.toLowerCase().includes(lowerNormalized) || c.symbol.toLowerCase() === lowerNormalized,
  );

  if (fuzzyCatalogMatches.length === 1) {
    const entry = fuzzyCatalogMatches[0] as CoinGeckoCoinListEntry;
    const candidate: CoinGeckoSearchCandidate = {
      coingeckoId: entry.coingeckoId,
      symbol: entry.symbol,
      name: entry.name,
      marketCapRank: null,
      thumbUrl: null,
      largeUrl: null,
    };
    return { kind: "resolved", identity: candidateToIdentity(candidate, entry) };
  }

  if (fuzzyCatalogMatches.length > 1) {
    const identities = fuzzyCatalogMatches.map((entry) =>
      candidateToIdentity(
        {
          coingeckoId: entry.coingeckoId,
          symbol: entry.symbol,
          name: entry.name,
          marketCapRank: null,
          thumbUrl: null,
          largeUrl: null,
        },
        entry,
      ),
    );
    return {
      kind: "ambiguous",
      candidates: identities,
      message: `Query "${normalized}" matches ${identities.length} tokens.`,
    };
  }

  // Try fuzzy search results from CoinGecko
  const fuzzySearchMatches = candidates.filter(
    (c) => c.name.toLowerCase().includes(lowerNormalized),
  );

  if (fuzzySearchMatches.length === 1) {
    const candidate = fuzzySearchMatches[0]!;
    const catalogEntry = catalogById.get(candidate.coingeckoId) ?? null;
    return { kind: "resolved", identity: candidateToIdentity(candidate, catalogEntry) };
  }

  return { kind: "not_found", message: `No token found matching: ${normalized}` };
}

/**
 * Resolves a token by contract address on a specific network.
 * Uses Alchemy to verify the contract and fetch metadata.
 */
export async function resolveByContract(
  networkValue: string,
  contractAddressValue: string,
): Promise<CryptoResolutionResult> {
  let network: AlchemyNetwork;
  try {
    network = normalizeAlchemyNetwork(networkValue);
  } catch (error) {
    return { kind: "not_found", message: error instanceof Error ? error.message : String(error) };
  }

  let contractAddress: string;
  try {
    contractAddress = normalizeEvmAddress(contractAddressValue);
  } catch (error) {
    return { kind: "not_found", message: error instanceof Error ? error.message : String(error) };
  }

  // Try to find in CoinGecko catalog first
  const catalog = await getCoinGeckoCatalog();
  const catalogMatch = catalog.find(
    (entry) =>
      entry.platforms.some(
        (p) => normalizeNetwork(p.network) === network && p.address.toLowerCase() === contractAddress,
      ),
  );

  if (catalogMatch) {
    // Found in CoinGecko catalog - return the canonical token
    const candidate: CoinGeckoSearchCandidate = {
      coingeckoId: catalogMatch.coingeckoId,
      symbol: catalogMatch.symbol,
      name: catalogMatch.name,
      marketCapRank: null,
      thumbUrl: null,
      largeUrl: null,
    };
    return { kind: "resolved", identity: candidateToIdentity(candidate, catalogMatch) };
  }

  // Not in CoinGecko catalog - try Alchemy to verify it's a real token
  // Note: We don't import Alchemy fetchers here to avoid circular deps;
  // the service layer will handle Alchemy verification after resolution.
  return {
    kind: "not_found",
    message: `Contract ${contractAddress} on ${network} not found in CoinGecko catalog. Use Alchemy verification directly.`,
  };
}

/**
 * Main resolution entry point.
 * Tries: CoinGecko ID -> Symbol -> Name -> Contract (if network provided).
 */
export async function resolveCrypto(
  query: string,
  options: { network?: string; contractAddress?: string } = {},
): Promise<CryptoResolutionResult> {
  const trimmed = query.trim();

  if (!trimmed) {
    return { kind: "not_found", message: "Empty query." };
  }

  // If network + contract provided, try contract resolution first
  if (options.network && options.contractAddress) {
    const contractResult = await resolveByContract(options.network, options.contractAddress);
    if (contractResult.kind === "resolved") {
      return contractResult;
    }
    // Fall through to symbol/name search
  }

  // Heuristic: if it looks like a CoinGecko ID (lowercase, hyphens, no spaces), try that first
  const looksLikeCoingeckoId = /^[a-z0-9-]+$/.test(trimmed) && !trimmed.includes(" ");

  if (looksLikeCoingeckoId) {
    const idResult = await resolveByCoingeckoId(trimmed);
    if (idResult.kind === "resolved" || idResult.kind === "ambiguous") {
      return idResult;
    }
    // Fall through
  }

  // Heuristic: if it looks like a ticker (short, uppercase, no spaces), try symbol first
  const looksLikeSymbol = /^[A-Z0-9.]{1,10}$/i.test(trimmed) && !trimmed.includes(" ");

  if (looksLikeSymbol) {
    const symbolResult = await resolveBySymbol(trimmed);
    if (symbolResult.kind === "resolved" || symbolResult.kind === "ambiguous") {
      return symbolResult;
    }
    // Fall through to name search
  }

  // Try name search
  return resolveByName(trimmed);
}

/* -------------------------------------------------------------------------- */
/*                              Search/Autocomplete                           */
/* -------------------------------------------------------------------------- */

export async function searchCrypto(query: string, limit = 10): Promise<CryptoSearchCandidate[]> {
  const normalized = normalizeName(query);
  if (!normalized) {
    return [];
  }

  const results: CryptoSearchCandidate[] = [];

  // 1. CoinGecko search (fast, prefix match)
  const searchReport = await searchCoinGecko(normalized);
  for (const candidate of searchReport.candidates.slice(0, limit)) {
    results.push({
      symbol: normalizeSymbol(candidate.symbol),
      name: normalizeName(candidate.name),
      coingeckoId: candidate.coingeckoId,
      thumbUrl: candidate.thumbUrl,
      largeUrl: candidate.largeUrl,
      marketCapRank: candidate.marketCapRank,
      networks: [],
      primaryNetwork: null,
      primaryContract: null,
      provider: "CoinGecko",
    });
  }

  // 2. Enrich with catalog data for network/contract info
  if (results.length > 0) {
    const catalog = await getCoinGeckoCatalog();
    const catalogById = new Map(catalog.map((c) => [c.coingeckoId, c]));

    for (const result of results) {
      const entry = catalogById.get(result.coingeckoId ?? "");
      if (entry) {
        result.networks = [...new Set(entry.platforms.map((p) => normalizeNetwork(p.network)))].sort();
        if (entry.platforms.length > 0) {
          const primary = entry.platforms[0]!;
          result.primaryNetwork = normalizeNetwork(primary.network);
          result.primaryContract = primary.address.toLowerCase();
        }
      }
    }
  }

  return results.slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/*                              Native Asset Helpers                            */
/* -------------------------------------------------------------------------- */

export const NATIVE_ASSETS: Record<string, { symbol: string; name: string; coingeckoId: string; network: string }> = {
  BTC: { symbol: "BTC", name: "Bitcoin", coingeckoId: "bitcoin", network: "bitcoin" },
  ETH: { symbol: "ETH", name: "Ethereum", coingeckoId: "ethereum", network: "ethereum" },
  SOL: { symbol: "SOL", name: "Solana", coingeckoId: "solana", network: "solana" },
  ADA: { symbol: "ADA", name: "Cardano", coingeckoId: "cardano", network: "cardano" },
  DOT: { symbol: "DOT", name: "Polkadot", coingeckoId: "polkadot", network: "polkadot" },
  AVAX: { symbol: "AVAX", name: "Avalanche", coingeckoId: "avalanche-2", network: "avalanche" },
  MATIC: { symbol: "MATIC", name: "Polygon", coingeckoId: "polygon", network: "polygon" },
  BNB: { symbol: "BNB", name: "BNB", coingeckoId: "binancecoin", network: "binance-smart-chain" },
};

/**
 * Checks if a symbol is a known native asset and returns its identity directly.
 * This avoids API calls for the most common native assets.
 */
export function tryResolveNativeAsset(symbol: string): CryptoIdentity | null {
  const upper = normalizeSymbol(symbol);
  const native = NATIVE_ASSETS[upper];
  if (!native) return null;

  return {
    assetId: "",
    symbol: native.symbol,
    name: native.name,
    network: native.network,
    coingeckoId: native.coingeckoId,
    deployments: {
      [native.network]: {
        network: native.network,
        chainId: null,
        contractAddress: "",
        decimals: null,
        isNative: true,
        verified: true,
        source: "Manual",
        explorerUrl: null,
      },
    },
    providerIds: buildProviderIds(native.coingeckoId),
  };
}