import type { CommodityDatasetName, CommodityIngestionPlanStep, CommodityIngestionPlan, CommodityCoverageReport } from "../../types/commodities/commodity.types.js";

/**
 * Freshness policies for each commodity dataset.
 * These are the single source of truth for when data is considered stale.
 * Policies are expressed as maximum age in days.
 */

export interface CommodityFreshnessPolicy {
  dataset: CommodityDatasetName;
  maxAgeDays: number;
  description: string;
  // Whether to check for new data incrementally (true) or full refresh (false)
  incremental: boolean;
}

export const COMMODITY_FRESHNESS_POLICIES: CommodityFreshnessPolicy[] = [
  {
    dataset: "profile",
    maxAgeDays: 30,
    description: "Refresh after 30 days, or when missing. Preserve curated fields.",
    incremental: false,
  },
  {
    dataset: "market_snapshot",
    maxAgeDays: 0, // Refreshed on every explicit retrieval
    description: "Refresh on every explicit full commodity retrieval.",
    incremental: true,
  },
  {
    dataset: "price_history",
    maxAgeDays: 7,
    description: "Fetch missing dates and recent corrections; avoid full re-download.",
    incremental: true,
  },
  {
    dataset: "fundamentals",
    maxAgeDays: 90,
    description: "Refresh when new fundamental data available.",
    incremental: true,
  },
];

const POLICY_BY_DATASET = new Map(COMMODITY_FRESHNESS_POLICIES.map((p) => [p.dataset, p]));

/**
 * Gets the freshness policy for a dataset.
 */
export function getCommodityFreshnessPolicy(dataset: CommodityDatasetName): CommodityFreshnessPolicy {
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
export function isCommodityFresh(lastCollectedAt: string | null, dataset: CommodityDatasetName): boolean {
  if (!lastCollectedAt) {
    return false;
  }
  const policy = getCommodityFreshnessPolicy(dataset);
  if (policy.maxAgeDays === 0) {
    return false; // market_snapshot is never fresh by age alone
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
export function createCommodityIngestionPlan(
  assetId: string,
  symbol: string,
  coverage: CommodityCoverageReport,
  options: { refresh?: boolean; include?: CommodityDatasetName[] } = {},
): CommodityIngestionPlan {
  const steps: CommodityIngestionPlanStep[] = [];
  const requestedDatasets = options.include ?? [
    "profile",
    "market_snapshot",
    "price_history",
    "fundamentals",
  ];

  // Priority order: profile first (identity), then market, then history,
  // then fundamentals
  const priorityOrder: Record<CommodityDatasetName, number> = {
    profile: 1,
    market_snapshot: 2,
    price_history: 3,
    fundamentals: 4,
  };

  for (const dataset of requestedDatasets) {
    const datasetCoverage = coverage.datasets.find((d) => d.dataset === dataset);
    if (!datasetCoverage) continue;

    // Skip unsupported datasets
    if (datasetCoverage.status === "unsupported") continue;

    if (options.refresh || datasetCoverage.status === "missing" || datasetCoverage.status === "stale") {
      const policy = getCommodityFreshnessPolicy(dataset);
      steps.push({
        dataset,
        reason:
          datasetCoverage.status === "missing"
            ? "Dataset is missing."
            : datasetCoverage.status === "stale"
            ? `Dataset is stale (${policy.description})`
            : "Forced refresh requested.",
        priority: priorityOrder[dataset] ?? 10,
        estimatedRequests: estimateCommodityRequests(dataset),
        dependsOn: getCommodityDependencies(dataset),
      });
    }
  }

  // Sort by priority
  steps.sort((a, b) => a.priority - b.priority);

  return {
    assetId,
    symbol,
    steps,
    totalEstimatedRequests: steps.reduce((sum: number, s: CommodityIngestionPlanStep) => sum + s.estimatedRequests, 0),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Estimates the number of API requests needed for a dataset.
 * These are rough estimates for budgeting.
 */
function estimateCommodityRequests(dataset: CommodityDatasetName): number {
  switch (dataset) {
    case "profile":
      return 1; // FMP commodity list (already cached) + reference lookup
    case "market_snapshot":
      return 1; // FMP quote
    case "price_history":
      return 3; // Chunked history requests (up to 3 windows for 1 year)
    case "fundamentals":
      return 0; // Not implemented
    default:
      return 2;
  }
}

/**
 * Returns dataset dependencies.
 * Some datasets require others to be collected first.
 */
function getCommodityDependencies(dataset: CommodityDatasetName): CommodityDatasetName[] {
  switch (dataset) {
    case "market_snapshot":
    case "price_history":
      return ["profile"]; // Need asset ID
    case "fundamentals":
      return ["profile"];
    default:
      return [];
  }
}