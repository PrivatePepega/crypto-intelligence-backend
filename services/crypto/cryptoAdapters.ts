import "dotenv/config";

import {
  fetchCoinGeckoCoin,
  fetchCoinGeckoMarkets,
  fetchCoinGeckoOhlc,
  type CoinGeckoAssetProfile,
  type CoinGeckoMarketsReport,
  type CoinGeckoOhlcReport,
} from "../../collectors/assets/crypto/coingeckoFetchers.js";
import {
  fetchAlchemyTokenMetadata,
  fetchAlchemyContractAnalysis,
  fetchAlchemyTokenSupply,
  fetchAlchemyTokenProfile,
  type AlchemyTokenProfile,
} from "../../collectors/assets/crypto/alchemyFetchers.js";
import {
  fetchTokenSecurity,
  fetchSupportedChains,
  type GoPlusTokenSecurityRecord,
  type GoPlusChain,
} from "../../collectors/assets/crypto/goplusFetchers.js";
import type {
  CryptoIdentity,
  CryptoProfile,
  CryptoMarketSnapshot,
  CryptoPriceHistory,
  CryptoContractMetadata,
  CryptoContractAnalysis,
  CryptoTokenSupply,
  CryptoSecurityRecord,
} from "../../types/crypto/crypto.types.js";
import {
  normalizeCryptoProfile,
  normalizeCryptoMarketSnapshot,
  normalizeCryptoOhlcCandles,
  normalizeCryptoContractMetadata,
  normalizeCryptoContractAnalysis,
  normalizeCryptoTokenSupply,
  normalizeCryptoSecurityRecord,
  buildCryptoIdentity,
} from "./cryptoNormalizers.js";

/* -------------------------------------------------------------------------- */
/*                              CoinGecko Adapters                            */
/* -------------------------------------------------------------------------- */

export interface ProfileCollectionResult {
  ok: boolean;
  profile: CryptoProfile | null;
  coingeckoProfile: CoinGeckoAssetProfile | null;
  error: string | null;
  collectedAt: string;
}

export interface MarketCollectionResult {
  ok: boolean;
  snapshots: CryptoMarketSnapshot[];
  error: string | null;
  collectedAt: string;
}

export interface OhlcCollectionResult {
  ok: boolean;
  history: CryptoPriceHistory | null;
  error: string | null;
  collectedAt: string;
}

/**
 * Collects full token profile from CoinGecko.
 */
export async function collectCoinGeckoProfile(
  coingeckoId: string,
): Promise<ProfileCollectionResult> {
  try {
    const rawProfile = await fetchCoinGeckoCoin(coingeckoId);
    const profile = normalizeCryptoProfile(rawProfile);
    return {
      ok: true,
      profile,
      coingeckoProfile: rawProfile,
      error: null,
      collectedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      profile: null,
      coingeckoProfile: null,
      error: message,
      collectedAt: new Date().toISOString(),
    };
  }
}

/**
 * Collects current market snapshots for one or more tokens.
 */
export async function collectCoinGeckoMarkets(
  coingeckoIds: string[],
): Promise<MarketCollectionResult> {
  try {
    const report = await fetchCoinGeckoMarkets({
      ids: coingeckoIds,
      vsCurrency: "usd",
      priceChangePercentages: ["24h", "7d", "30d"],
    });

    const snapshots: CryptoMarketSnapshot[] = [];
    for (const snapshot of report.snapshots) {
      const sourceUrl = report.sourceUrls[0] ?? "";
      const normalized = normalizeCryptoMarketSnapshot(
        snapshot,
        sourceUrl,
        snapshot.information.observedAt,
        snapshot.information.collectedAt,
      );
      snapshots.push(normalized);
    }

    return {
      ok: true,
      snapshots,
      error: report.missingIds.length > 0 ? `Missing IDs: ${report.missingIds.join(", ")}` : null,
      collectedAt: report.fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      snapshots: [],
      error: message,
      collectedAt: new Date().toISOString(),
    };
  }
}

/**
 * Collects OHLC candles for a token.
 */
export async function collectCoinGeckoOhlc(
  coingeckoId: string,
  options: { days?: number } = {},
): Promise<OhlcCollectionResult> {
  try {
    const report = await fetchCoinGeckoOhlc(coingeckoId, {
      days: options.days ?? 30,
      vsCurrency: "usd",
    });

    const requested = {
      from: new Date(Date.now() - (options.days ?? 30) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
    };

    const history = normalizeCryptoOhlcCandles(
      { candles: report.candles, coingeckoId, vsCurrency: "usd" },
      requested,
    );

    return {
      ok: true,
      history,
      error: report.rejectedRows > 0 ? `${report.rejectedRows} rows rejected` : null,
      collectedAt: report.fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      history: null,
      error: message,
      collectedAt: new Date().toISOString(),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                              Alchemy Adapters                              */
/* -------------------------------------------------------------------------- */

export interface AlchemyMetadataCollectionResult {
  ok: boolean;
  metadata: CryptoContractMetadata[];
  error: string | null;
  collectedAt: string;
}

export interface AlchemyAnalysisCollectionResult {
  ok: boolean;
  analyses: CryptoContractAnalysis[];
  error: string | null;
  collectedAt: string;
}

export interface AlchemySupplyCollectionResult {
  ok: boolean;
  supplies: CryptoTokenSupply[];
  error: string | null;
  collectedAt: string;
}

/**
 * Collects contract metadata for all deployments of a token.
 */
export async function collectAlchemyMetadata(
  identity: CryptoIdentity,
): Promise<AlchemyMetadataCollectionResult> {
  const metadata: CryptoContractMetadata[] = [];
  const errors: string[] = [];

  for (const [network, deployment] of Object.entries(identity.deployments)) {
    if (deployment.isNative) continue; // Skip native assets

    try {
      // Skip non-EVM networks (Alchemy only supports EVM)
      const evmNetworks = ["ethereum", "base", "arbitrum", "polygon", "optimism", "bsc", "avalanche"];
      if (!evmNetworks.includes(network.toLowerCase())) {
        continue;
      }

      const rawMetadata = await fetchAlchemyTokenMetadata(network, deployment.contractAddress);
      const normalized = normalizeCryptoContractMetadata(rawMetadata);
      metadata.push(normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${network}:${deployment.contractAddress} - ${message}`);
    }
  }

  return {
    ok: errors.length === 0,
    metadata,
    error: errors.length > 0 ? errors.join("; ") : null,
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Collects contract analysis (bytecode) for all deployments.
 */
export async function collectAlchemyAnalysis(
  identity: CryptoIdentity,
): Promise<AlchemyAnalysisCollectionResult> {
  const analyses: CryptoContractAnalysis[] = [];
  const errors: string[] = [];

  for (const [network, deployment] of Object.entries(identity.deployments)) {
    if (deployment.isNative) continue;

    try {
      const evmNetworks = ["ethereum", "base", "arbitrum", "polygon", "optimism", "bsc", "avalanche"];
      if (!evmNetworks.includes(network.toLowerCase())) {
        continue;
      }

      const rawAnalysis = await fetchAlchemyContractAnalysis(network, deployment.contractAddress);
      const normalized = normalizeCryptoContractAnalysis(rawAnalysis);
      analyses.push(normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${network}:${deployment.contractAddress} - ${message}`);
    }
  }

  return {
    ok: errors.length === 0,
    analyses,
    error: errors.length > 0 ? errors.join("; ") : null,
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Collects token supply for all deployments.
 */
export async function collectAlchemySupply(
  identity: CryptoIdentity,
): Promise<AlchemySupplyCollectionResult> {
  const supplies: CryptoTokenSupply[] = [];
  const errors: string[] = [];

  for (const [network, deployment] of Object.entries(identity.deployments)) {
    if (deployment.isNative) continue;

    try {
      const evmNetworks = ["ethereum", "base", "arbitrum", "polygon", "optimism", "bsc", "avalanche"];
      if (!evmNetworks.includes(network.toLowerCase())) {
        continue;
      }

      // Get decimals from metadata first
      const metadata = await fetchAlchemyTokenMetadata(network, deployment.contractAddress);
      const rawSupply = await fetchAlchemyTokenSupply(network, deployment.contractAddress, {
        decimals: metadata.decimals,
        decimalsSource: "alchemy_getTokenMetadata",
      });
      const normalized = normalizeCryptoTokenSupply(rawSupply);
      supplies.push(normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${network}:${deployment.contractAddress} - ${message}`);
    }
  }

  return {
    ok: errors.length === 0,
    supplies,
    error: errors.length > 0 ? errors.join("; ") : null,
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Collects full Alchemy token profile (metadata + analysis + supply) for one contract.
 */
export async function collectAlchemyTokenProfile(
  network: string,
  contractAddress: string,
): Promise<{ profile: AlchemyTokenProfile | null; error: string | null; collectedAt: string }> {
  try {
    const profile = await fetchAlchemyTokenProfile(network, contractAddress);
    return {
      profile,
      error: profile.supplyError ?? null,
      collectedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      profile: null,
      error: message,
      collectedAt: new Date().toISOString(),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                              GoPlus Adapters                               */
/* -------------------------------------------------------------------------- */

export interface GoPlusSecurityCollectionResult {
  ok: boolean;
  security: CryptoSecurityRecord | null;
  error: string | null;
  collectedAt: string;
}

/**
 * Collects security indicators for all EVM deployments of a token.
 */
export async function collectGoPlusSecurity(
  identity: CryptoIdentity,
): Promise<GoPlusSecurityCollectionResult> {
  const results: CryptoSecurityRecord[] = [];
  const errors: string[] = [];

  // Get supported chains once
  let chains: GoPlusChain[] = [];
  try {
    const chainList = await fetchSupportedChains();
    chains = chainList.chains;
  } catch (error) {
    return {
      ok: false,
      security: null,
      error: `Failed to fetch GoPlus supported chains: ${error instanceof Error ? error.message : String(error)}`,
      collectedAt: new Date().toISOString(),
    };
  }

  for (const [network, deployment] of Object.entries(identity.deployments)) {
    if (deployment.isNative) continue;
    if (!deployment.chainId) continue; // Need chain ID for GoPlus

    try {
      const rawSecurity = await fetchTokenSecurity(
        deployment.chainId.toString(),
        deployment.contractAddress,
        { chains },
      );
      const normalized = normalizeCryptoSecurityRecord(rawSecurity);
      results.push(normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${network}:${deployment.contractAddress} - ${message}`);
    }
  }

  // Return the first result (primary network) or null
  // In the future, we could store multiple network security records
  return {
    ok: errors.length === 0,
    security: results[0] ?? null,
    error: errors.length > 0 ? errors.join("; ") : null,
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Collects security for a specific contract on a specific chain.
 */
export async function collectGoPlusSecurityForContract(
  chainId: string,
  contractAddress: string,
): Promise<GoPlusSecurityCollectionResult> {
  try {
    const chainList = await fetchSupportedChains();
    const rawSecurity = await fetchTokenSecurity(chainId, contractAddress, { chains: chainList.chains });
    const normalized = normalizeCryptoSecurityRecord(rawSecurity);
    return {
      ok: true,
      security: normalized,
      error: null,
      collectedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      security: null,
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
  markets: MarketCollectionResult;
  ohlc: OhlcCollectionResult;
  metadata: AlchemyMetadataCollectionResult;
  analysis: AlchemyAnalysisCollectionResult;
  supply: AlchemySupplyCollectionResult;
  security: GoPlusSecurityCollectionResult;
  errors: Array<{ dataset: string; message: string }>;
}

/**
 * Runs all collectors for a token and returns combined results.
 */
export async function collectAllCryptoData(
  identity: CryptoIdentity,
): Promise<FullCollectionResult> {
  const errors: Array<{ dataset: string; message: string }> = [];

  // 1. CoinGecko profile (canonical identity)
  const profileResult = await collectCoinGeckoProfile(identity.coingeckoId!);
  if (profileResult.error) errors.push({ dataset: "profile", message: profileResult.error });

  // 2. CoinGecko market snapshot
  const marketsResult = await collectCoinGeckoMarkets([identity.coingeckoId!]);
  if (marketsResult.error) errors.push({ dataset: "market_snapshot", message: marketsResult.error });

  // 3. CoinGecko OHLC
  const ohlcResult = await collectCoinGeckoOhlc(identity.coingeckoId!);
  if (ohlcResult.error) errors.push({ dataset: "price_history", message: ohlcResult.error });

  // 4. Alchemy metadata (for all EVM deployments)
  const metadataResult = await collectAlchemyMetadata(identity);
  if (metadataResult.error) errors.push({ dataset: "contract_metadata", message: metadataResult.error });

  // 5. Alchemy contract analysis
  const analysisResult = await collectAlchemyAnalysis(identity);
  if (analysisResult.error) errors.push({ dataset: "contract_analysis", message: analysisResult.error });

  // 6. Alchemy token supply
  const supplyResult = await collectAlchemySupply(identity);
  if (supplyResult.error) errors.push({ dataset: "token_supply", message: supplyResult.error });

  // 7. GoPlus security
  const securityResult = await collectGoPlusSecurity(identity);
  if (securityResult.error) errors.push({ dataset: "security", message: securityResult.error });

  return {
    profile: profileResult,
    markets: marketsResult,
    ohlc: ohlcResult,
    metadata: metadataResult,
    analysis: analysisResult,
    supply: supplyResult,
    security: securityResult,
    errors,
  };
}