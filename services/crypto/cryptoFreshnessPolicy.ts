import type { CryptoDatasetName, CryptoIngestionPlanStep, CryptoIngestionPlan } from "../../types/crypto/crypto.types.js";
import type { CryptoCoverageReport } from "../../types/crypto/crypto.types.js";

/**
 * Freshness policies for each crypto dataset.
 * These are the single source of truth for when data is considered stale.
 * Policies are expressed as maximum age in days.
 */

export interface CryptoFreshnessPolicy {
  dataset: CryptoDatasetName;
  maxAgeDays: number;
  description: string;
  // Whether to check for new data incrementally (true) or full refresh (false)
  incremental: boolean;
}

export const CRYPTO_FRESHNESS_POLICIES: CryptoFreshnessPolicy[] = [
  {
    dataset: "directory",
    maxAgeDays: 1,
    description: "Sync via catalog synchronization job (24h TTL).",
    incremental: false,
  },
  {
    dataset: "profile",
    maxAgeDays: 7,
    description: "Refresh after 7 days, or when missing. Preserve verified fields.",
    incremental: false,
  },
  {
    dataset: "market_snapshot",
    maxAgeDays: 0, // Refreshed on every explicit retrieval
    description: "Refresh on every explicit full asset retrieval.",
    incremental: true,
  },
  {
    dataset: "price_history",
    maxAgeDays: 2,
    description: "Fetch missing dates and recent corrections; avoid full re-download.",
    incremental: true,
  },
  {
    dataset: "contract_metadata",
    maxAgeDays: 30,
    description: "Refresh when missing or stale (~30 days); distinguish immutable from mutable metadata.",
    incremental: false,
  },
  {
    dataset: "contract_analysis",
    maxAgeDays: 90,
    description: "Cache by chain, address, and bytecode hash. Avoid repeat analysis when bytecode unchanged.",
    incremental: true,
  },
  {
    dataset: "token_supply",
    maxAgeDays: 1,
    description: "Refresh when stale (~24h); record block/observation time.",
    incremental: true,
  },
  {
    dataset: "security",
    maxAgeDays: 1,
    description: "Refresh when stale (~24h) and preserve historical security snapshots.",
    incremental: true,
  },
  {
    dataset: "transfers",
    maxAgeDays: 7,
    description: "Incremental; use checkpoint/range mechanism to avoid rescanning.",
    incremental: true,
  },
  {
    dataset: "balances",
    maxAgeDays: 0,
    description: "On-demand only; collect when wallet is known and feature requested.",
    incremental: true,
  },
  {
    dataset: "holder_distribution",
    maxAgeDays: 0,
    description: "Only when a valid data source is implemented. Do not fabricate from balances/transfers.",
    incremental: false,
  },
];

const POLICY_BY_DATASET = new Map(CRYPTO_FRESHNESS_POLICIES.map((p) => [p.dataset, p]));

/**
 * Gets the freshness policy for a dataset.
 */
export function getCryptoFreshnessPolicy(dataset: CryptoDatasetName): CryptoFreshnessPolicy {
  return POLICY_BY_DATASET.get(dataset) ?? {
    dataset,
    maxAgeDays: 30,
    description: "Default: refresh after 30 days.",
    incremental: true,
  };
}

/**
 * Determines if a dataset is fresh based on its last collection time.
 */
export function isCryptoFresh(lastCollectedAt: string | null, dataset: CryptoDatasetName): boolean {
  if (!lastCollectedAt) {
    return false;
  }
  const policy = getCryptoFreshnessPolicy(dataset);
  if (policy.maxAgeDays === 0) {
    return false; // market_snapshot, balances, holder_distribution are never fresh by age alone
  }
  const lastCollected = new Date(lastCollectedAt);
  const now = new Date();
  const diffDays = (now.getTime() - lastCollected.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= policy.maxAgeDays;
}

/**
 * Creates an ingestion plan based on coverage gaps.
 * Returns steps in priority order (lower priority number = higher priority).
 */
export function createCryptoIngestionPlan(
  assetId: string,
  symbol: string,
  coverage: CryptoCoverageReport,
  options: { refresh?: boolean; include?: CryptoDatasetName[]; network?: string; contractAddress?: string } = {},
): CryptoIngestionPlan {
  const steps: CryptoIngestionPlanStep[] = [];
  const requestedDatasets = options.include ?? [
    "profile",
    "market_snapshot",
    "price_history",
    "contract_metadata",
    "contract_analysis",
    "token_supply",
    "security",
    "transfers",
  ];

  // Priority order: profile first (identity), then market, then history,
  // then contract data, then security, then transfers
  const priorityOrder: Record<CryptoDatasetName, number> = {
    directory: 0,
    profile: 1,
    market_snapshot: 2,
    price_history: 3,
    contract_metadata: 4,
    contract_analysis: 5,
    token_supply: 6,
    security: 7,
    transfers: 8,
    balances: 9,
    holder_distribution: 10,
  };

  for (const dataset of requestedDatasets) {
    const datasetCoverage = coverage.datasets.find((d) => d.dataset === dataset);
    if (!datasetCoverage) continue;

    // Skip unsupported datasets
    if (datasetCoverage.status === "unsupported") continue;

    if (options.refresh || datasetCoverage.status === "missing" || datasetCoverage.status === "stale") {
      const policy = getCryptoFreshnessPolicy(dataset);
      const step: CryptoIngestionPlanStep = {
        dataset,
        reason:
          datasetCoverage.status === "missing"
            ? "Dataset is missing."
            : datasetCoverage.status === "stale"
            ? `Dataset is stale (${policy.description})`
            : "Forced refresh requested.",
        priority: priorityOrder[dataset] ?? 10,
        estimatedRequests: estimateCryptoRequests(dataset),
        dependsOn: getCryptoDependencies(dataset),
      };
      if (options.network !== undefined) step.network = options.network;
      if (options.contractAddress !== undefined) step.contractAddress = options.contractAddress;
      steps.push(step);
    }
  }

  // Sort by priority
  steps.sort((a, b) => a.priority - b.priority);

  return {
    assetId,
    symbol,
    steps,
    totalEstimatedRequests: steps.reduce((sum, s) => sum + s.estimatedRequests, 0),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Estimates the number of API requests needed for a dataset.
 * These are rough estimates for budgeting.
 */
function estimateCryptoRequests(dataset: CryptoDatasetName): number {
  switch (dataset) {
    case "directory":
      return 1; // CoinGecko coins/list (one large request)
    case "profile":
      return 1; // CoinGecko coin profile
    case "market_snapshot":
      return 1; // CoinGecko markets
    case "price_history":
      return 2; // CoinGecko OHLC + market_chart (or just OHLC for candles)
    case "contract_metadata":
      return 1; // Alchemy alchemy_getTokenMetadata per network/contract
    case "contract_analysis":
      return 1; // Alchemy eth_getCode per network/contract
    case "token_supply":
      return 2; // Alchemy alchemy_getTokenMetadata + eth_call totalSupply()
    case "security":
      return 1; // GoPlus token_security per contract
    case "transfers":
      return 5; // Alchemy alchemy_getAssetTransfers (paginated)
    case "balances":
      return 1; // Alchemy alchemy_getTokenBalances
    case "holder_distribution":
      return 0; // Not implemented
    default:
      return 2;
  }
}

/**
 * Returns dataset dependencies.
 * Some datasets require others to be collected first.
 */
function getCryptoDependencies(dataset: CryptoDatasetName): CryptoDatasetName[] {
  switch (dataset) {
    case "market_snapshot":
    case "price_history":
      return ["profile"]; // Need asset ID and coingeckoId
    case "contract_metadata":
    case "contract_analysis":
    case "token_supply":
    case "security":
    case "transfers":
      return ["profile"]; // Need network and contract address from profile
    case "holder_distribution":
      return ["transfers"]; // Would need transfer data as input
    default:
      return [];
  }
}