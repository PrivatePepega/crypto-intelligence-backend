import { z } from "zod";

/**
 * Crypto intelligence types for the deterministic ingestion service.
 *
 * These types describe the canonical shapes used by the crypto resolver,
 * coverage checker, ingestion planner, normalizers, and repositories.
 * They are separate from provider-specific schemas so the service layer
 * never depends on CoinGecko, Alchemy, or GoPlus field names directly.
 */

/* -------------------------------------------------------------------------- */
/*                                  Identity                                  */
/* -------------------------------------------------------------------------- */

/** Provider-agnostic canonical crypto asset identifier. */
export interface CryptoIdentity {
  /** Our canonical asset UUID. */
  assetId: string;
  /** Primary symbol (e.g., BTC, ETH, USDC). */
  symbol: string;
  /** Full token/project name. */
  name: string;
  /** Primary network for native assets (e.g., bitcoin, ethereum). */
  network: string | null;
  /** CoinGecko stable ID (e.g., bitcoin, ethereum, usd-coin). */
  coingeckoId: string | null;
  /** Contract deployments keyed by normalized network. */
  deployments: Record<string, CryptoDeployment>;
  /** Provider-specific identifiers, keyed by provider. */
  providerIds: Record<string, Record<string, unknown>>;
}

/** A single contract deployment on a specific network. */
export interface CryptoDeployment {
  network: string;
  chainId: number | null;
  contractAddress: string;
  decimals: number | null;
  isNative: boolean;
  verified: boolean;
  source: "CoinGecko" | "Alchemy" | "GoPlus" | "Manual";
  explorerUrl: string | null;
}

/** Result of resolving a user query to a canonical crypto asset. */
export type CryptoResolutionResult =
  | { kind: "resolved"; identity: CryptoIdentity }
  | { kind: "not_found"; message: string }
  | { kind: "ambiguous"; candidates: CryptoIdentity[]; message: string };

/** Lightweight candidate for autocomplete/search. */
export interface CryptoSearchCandidate {
  symbol: string;
  name: string;
  coingeckoId: string | null;
  thumbUrl: string | null;
  largeUrl: string | null;
  marketCapRank: number | null;
  networks: string[]; // networks where this token has deployments
  primaryNetwork: string | null;
  primaryContract: string | null;
  provider: "CoinGecko";
}

/* -------------------------------------------------------------------------- */
/*                              Provider Inputs                               */
/* -------------------------------------------------------------------------- */

/** CoinGecko search-symbol response item. */
export const coinGeckoSearchCandidateSchema = z.object({
  coingeckoId: z.string().trim().min(1),
  symbol: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1),
  marketCapRank: z.number().nullable().optional(),
  thumbUrl: z.string().nullable().optional(),
  largeUrl: z.string().nullable().optional(),
});

export type CoinGeckoSearchCandidate = z.infer<typeof coinGeckoSearchCandidateSchema>;
export type CoinGeckoSearchReport = z.infer<typeof coinGeckoSearchCandidateSchema>[];

/** CoinGecko coins list entry. */
export const coinGeckoCoinListEntrySchema = z.object({
  coingeckoId: z.string().trim().min(1),
  symbol: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1),
  platforms: z.array(z.object({
    network: z.string().trim().min(1),
    address: z.string().trim().min(1),
  })),
});

export type CoinGeckoCoinListEntry = z.infer<typeof coinGeckoCoinListEntrySchema>;

/* -------------------------------------------------------------------------- */
/*                            Normalized Crypto Data                          */
/* -------------------------------------------------------------------------- */

/** Normalized token profile (merged CoinGecko + Alchemy + GoPlus). */
export interface CryptoProfile {
  assetId: string;
  symbol: string;
  name: string;
  network: string | null;
  coingeckoId: string | null;
  description: string | null;
  category: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  genesisDate: string | null;
  hashingAlgorithm: string | null;
  blockTimeMinutes: number | null;
  providerData: Record<string, unknown>;
  updatedAt: string;
}

/** Contract metadata from Alchemy. */
export interface CryptoContractMetadata {
  network: string;
  chainId: number;
  contractAddress: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  logoUrl: string | null;
  isToken: boolean;
  explorerUrl: string;
  verified: boolean;
  source: "Alchemy";
  observedAt: string;
}

/** Contract bytecode analysis from Alchemy. */
export interface CryptoContractAnalysis {
  network: string;
  chainId: number;
  contractAddress: string;
  isContract: boolean;
  bytecodeHash: string | null;
  hashAlgorithm: "sha256";
  bytecodeBytes: number;
  isMinimalProxy: boolean;
  minimalProxyImplementation: string | null;
  isProxyLike: boolean;
  proxyEvidence: Array<{ name: string; selector: string }>;
  selectorsPresent: Array<{ name: string; selector: string }>;
  selectorsMissing: Array<{ name: string; selector: string }>;
  note: string;
  source: "Alchemy";
  retrievedAt: string;
  explorerUrl: string;
}

/** Token supply from Alchemy. */
export interface CryptoTokenSupply {
  network: string;
  chainId: number;
  contractAddress: string;
  blockTag: string;
  blockNumber: number | null;
  callData: string;
  rawValue: string | null;
  decimals: number | null;
  decimalsSource: "Alchemy" | "Manual" | "alchemy_getTokenMetadata" | "cli" | null;
  totalSupply: string | null; // Decimal-adjusted string
  note: string | null;
  source: "Alchemy";
  observedAt: string;
  explorerUrl: string;
}

/** Current market snapshot from CoinGecko. */
export interface CryptoMarketSnapshot {
  provider: "CoinGecko";
  coingeckoId: string;
  vsCurrency: string;
  currentPrice: number | null;
  marketCap: number | null;
  fullyDilutedValuation: number | null;
  marketCapRank: number | null;
  totalVolume: number | null;
  totalValueLocked: number | null;
  high24h: number | null;
  low24h: number | null;
  priceChange24h: number | null;
  priceChangePercentage24h: number | null;
  priceChangePercentage7d: number | null;
  priceChangePercentage30d: number | null;
  marketCapChange24h: number | null;
  marketCapChangePercentage24h: number | null;
  ath: number | null;
  athDate: string | null;
  athChangePercentage: number | null;
  atl: number | null;
  atlDate: string | null;
  atlChangePercentage: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  maxSupplyInfinite: boolean | null;
  lastUpdated: string | null;
  sourceUrl: string;
  observedAt: string;
  collectedAt: string;
}

/** Normalized OHLC candle for price history. */
export interface CryptoCandle {
  symbol: string;
  timestamp: string; // ISO timestamp at interval start
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  quoteCurrency: string;
  interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1mo";
}

/** Historical price data with coverage tracking. */
export interface CryptoPriceHistory {
  provider: "CoinGecko" | "Alchemy";
  coingeckoId: string | null;
  contractAddress: string | null;
  network: string | null;
  vsCurrency: string;
  interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1mo";
  fetchedAt: string;
  requested: { from: string | null; to: string | null };
  candles: CryptoCandle[];
  rejected: Array<{ timestamp: string | null; reason: string }>;
  duplicatesRemoved: number;
  coverage: {
    earliestCandle: string | null;
    latestCandle: string | null;
    expectedCount: number | null;
    actualCount: number;
    gaps: Array<{ from: string; to: string }>;
  };
}

/** Tokenomics information. */
export interface CryptoTokenomics {
  categories: string[];
  genesisDate: string | null;
  hashingAlgorithm: string | null;
  blockTimeMinutes: number | null;
  hasSupplyBreakdown: boolean | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  maxSupplyInfinite: boolean | null;
}

/** Social links. */
export interface CryptoSocials {
  homepage: string[];
  whitepaper: string | null;
  blockchainSites: string[];
  officialForumUrls: string[];
  chatUrls: string[];
  announcementUrls: string[];
  twitter: string | null;
  telegram: string | null;
  subreddit: string | null;
  repos: {
    github: string[];
    bitbucket: string[];
  };
}

/** Exchange/listing information. */
export interface CryptoExchangeInfo {
  name: string;
  pair: string | null;
  url: string | null;
  volumeUsd: number | null;
  trustScore: string | null;
}

/* -------------------------------------------------------------------------- */
/*                        GoPlus Security Data                                */
/* -------------------------------------------------------------------------- */

export type GoPlusRiskSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface GoPlusRiskFlag {
  id: string;
  severity: GoPlusRiskSeverity;
  label: string;
  evidence: string;
}

export interface GoPlusOwnerControls {
  ownerAddress: string | null;
  ownerRenounced: boolean | null;
  ownerBalance: string | null;
  ownerPercent: number | null;
  creatorAddress: string | null;
  creatorPercent: number | null;
  canTakeBackOwnership: boolean | null;
  hiddenOwner: boolean | null;
  ownerChangeBalance: boolean | null;
  selfdestruct: boolean | null;
  externalCall: boolean | null;
}

export interface GoPlusPermissions {
  transferPausable: boolean | null;
  isBlacklisted: boolean | null;
  isWhitelisted: boolean | null;
  tradingCooldown: boolean | null;
  personalSlippageModifiable: boolean | null;
  slippageModifiable: boolean | null;
  antiWhaleModifiable: boolean | null;
  isAntiWhale: boolean | null;
  cannotBuy: boolean | null;
  cannotSellAll: boolean | null;
}

export interface GoPlusTaxIndicators {
  buyTaxPercent: number | null;
  sellTaxPercent: number | null;
  transferTaxPercent: number | null;
}

export interface GoPlusDexListing {
  name: string | null;
  liquidityType: string | null;
  liquidity: string | null;
  pair: string | null;
  poolFee: string | null;
}

export interface GoPlusTrading {
  isHoneypot: boolean | null;
  honeypotWithSameCreator: boolean | null;
  isInDex: boolean | null;
  isInCex: boolean | null;
  cexList: string[];
  dexes: GoPlusDexListing[];
  lpHolderCount: number | null;
  lpTotalSupply: string | null;
}

export interface GoPlusTrustSignals {
  trustList: boolean | null;
  isAirdropScam: boolean | null;
  isTrueToken: boolean | null;
  isVerified: boolean | null;
  fakeToken: boolean | null;
  otherPotentialRisks: string | null;
  note: string | null;
}

/** Normalized GoPlus security record. */
export interface CryptoSecurityRecord {
  provider: "GoPlus";
  chainId: string;
  chainName: string | null;
  contractAddress: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  checkedAt: string;
  sourceUrl: string;
  providerCode: number | null;
  providerMessage: string | null;
  found: boolean;
  isOpenSource: boolean | null;
  isProxy: boolean | null;
  isMintable: boolean | null;
  ownerControls: GoPlusOwnerControls;
  permissions: GoPlusPermissions;
  taxIndicators: GoPlusTaxIndicators;
  trading: GoPlusTrading;
  holders: { count: number | null };
  supply: { providerTotalSupply: string | null };
  trust: GoPlusTrustSignals;
  riskFlags: GoPlusRiskFlag[];
  missingFields: string[];
  securitySummary: string;
  limitations: string[];
  raw: Record<string, unknown>;
}

/** Compact security snapshot for history/diffing. */
export interface CryptoSecuritySnapshot {
  checkedAt: string;
  isOpenSource: boolean | null;
  isProxy: boolean | null;
  isMintable: boolean | null;
  ownerAddress: string | null;
  ownerRenounced: boolean | null;
  ownerCanTakeBackOwnership: boolean | null;
  ownerHidden: boolean | null;
  ownerCanChangeBalance: boolean | null;
  transferPausable: boolean | null;
  isBlacklisted: boolean | null;
  isWhitelisted: boolean | null;
  tradingCooldown: boolean | null;
  personalSlippageModifiable: boolean | null;
  slippageModifiable: boolean | null;
  antiWhaleModifiable: boolean | null;
  isAntiWhale: boolean | null;
  cannotBuy: boolean | null;
  cannotSellAll: boolean | null;
  isHoneypot: boolean | null;
  honeypotWithSameCreator: boolean | null;
  buyTaxPercent: number | null;
  sellTaxPercent: number | null;
  transferTaxPercent: number | null;
  riskFlagIds: string[];
  securitySummary: string;
}

export interface CryptoSecurityHistory {
  provider: "GoPlus";
  chainId: string;
  contractAddress: string;
  updatedAt: string;
  snapshots: CryptoSecuritySnapshot[];
}

/* -------------------------------------------------------------------------- */
/*                         Coverage & Freshness                               */
/* -------------------------------------------------------------------------- */

export type CryptoDatasetStatus =
  | "missing"
  | "fresh"
  | "stale"
  | "partial"
  | "failed"
  | "unsupported";

export interface CryptoDatasetCoverage {
  dataset: string;
  status: CryptoDatasetStatus;
  lastCollectedAt: string | null;
  lastSuccessfulAt: string | null;
  latestSourceDate: string | null;
  freshnessPolicy: string;
  recordCount: number;
  error: string | null;
  coverageMetadata?: Record<string, unknown>; // e.g., history range, transfer checkpoint
}

export interface CryptoCoverageReport {
  assetId: string;
  symbol: string;
  datasets: CryptoDatasetCoverage[];
  overallFresh: boolean;
  collectedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                           Ingestion Planning                               */
/* -------------------------------------------------------------------------- */

export type CryptoDatasetName =
  | "directory"           // Token directory sync (catalog)
  | "profile"             // Token metadata, socials, tokenomics
  | "market_snapshot"     // Current price/market data
  | "price_history"       // OHLC candles
  | "contract_metadata"   // Alchemy token metadata
  | "contract_analysis"   // Alchemy bytecode analysis
  | "token_supply"        // Alchemy totalSupply()
  | "security"            // GoPlus security indicators
  | "transfers"           // Alchemy token transfers (incremental)
  | "balances"            // Alchemy known-wallet balances (on-demand)
  | "holder_distribution"; // Only when valid source exists

export interface CryptoIngestionPlanStep {
  dataset: CryptoDatasetName;
  reason: string;
  priority: number; // lower = higher priority
  estimatedRequests: number;
  dependsOn: CryptoDatasetName[];
  network?: string; // For network-specific datasets
  contractAddress?: string; // For contract-specific datasets
}

export interface CryptoIngestionPlan {
  assetId: string;
  symbol: string;
  steps: CryptoIngestionPlanStep[];
  totalEstimatedRequests: number;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                           Service Input/Output                             */
/* -------------------------------------------------------------------------- */

export interface GetOrIngestCryptoOptions {
  /** Force refresh even if data appears fresh. */
  refresh: boolean | undefined;
  /** Only include these datasets in the response (default: all available). */
  include: CryptoDatasetName[] | undefined;
  /** Skip ingestion entirely; only read from DB. */
  readOnly: boolean | undefined;
  /** Specific network to focus on (for multi-network tokens). */
  network?: string;
  /** Specific contract address to focus on. */
  contractAddress?: string;
  /** Price history range override. */
  historyRange?: { from: string; to: string; interval?: CryptoCandle["interval"] };
}

export interface CryptoIntelligenceResult {
  identity: CryptoIdentity;
  profile: CryptoProfile | null;
  market: CryptoMarketSnapshot | null;
  priceHistory: CryptoPriceHistory | null;
  tokenomics: CryptoTokenomics | null;
  contracts: {
    metadata: CryptoContractMetadata[];
    analysis: CryptoContractAnalysis[];
    supply: CryptoTokenSupply[];
  };
  security: CryptoSecurityRecord | null;
  socials: CryptoSocials | null;
  exchanges: CryptoExchangeInfo[];
  coverage: CryptoCoverageReport;
  errors: Array<{ dataset: CryptoDatasetName; message: string }>;
}