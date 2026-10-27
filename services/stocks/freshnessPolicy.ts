import type { DatasetName, IngestionPlanStep, IngestionPlan } from "../../types/stocks/stock.types.js";

/**
 * Freshness policies for each dataset.
 * These are the single source of truth for when data is considered stale.
 * Policies are expressed as maximum age in days.
 */

export interface FreshnessPolicy {
  dataset: DatasetName;
  maxAgeDays: number;
  description: string;
  // Whether to check for new data incrementally (true) or full refresh (false)
  incremental: boolean;
}

export const FRESHNESS_POLICIES: FreshnessPolicy[] = [
  {
    dataset: "profile",
    maxAgeDays: 7,
    description: "Refresh after 7 days, or when missing.",
    incremental: false,
  },
  {
    dataset: "quote",
    maxAgeDays: 0, // Refreshed on every explicit retrieval
    description: "Refresh on every explicit full stock retrieval.",
    incremental: true,
  },
  {
    dataset: "history",
    maxAgeDays: 2,
    description: "Fetch missing dates and recent corrections; avoid full re-download.",
    incremental: true,
  },
  {
    dataset: "financial_statements",
    maxAgeDays: 90,
    description: "Refresh when new SEC filing available, or periodically check.",
    incremental: true,
  },
  {
    dataset: "financial_metrics",
    maxAgeDays: 90,
    description: "Refresh when financial statements refresh.",
    incremental: true,
  },
  {
    dataset: "insider_transactions",
    maxAgeDays: 7,
    description: "Incrementally check for new Forms 3, 4, and 5.",
    incremental: true,
  },
  {
    dataset: "institutional_holdings",
    maxAgeDays: 60,
    description: "Check for newly filed or amended 13F reports; respect reporting delays.",
    incremental: true,
  },
  {
    dataset: "beneficial_ownership",
    maxAgeDays: 30,
    description: "Check for new or amended 13D/13G filings.",
    incremental: true,
  },
  {
    dataset: "corporate_actions",
    maxAgeDays: 14,
    description: "Check for new relevant filings and refresh extracted records.",
    incremental: true,
  },
];

const POLICY_BY_DATASET = new Map(FRESHNESS_POLICIES.map((p) => [p.dataset, p]));

/**
 * Gets the freshness policy for a dataset.
 */
export function getFreshnessPolicy(dataset: DatasetName): FreshnessPolicy {
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
export function isFresh(lastCollectedAt: string | null, dataset: DatasetName): boolean {
  if (!lastCollectedAt) {
    return false;
  }
  const policy = getFreshnessPolicy(dataset);
  if (policy.maxAgeDays === 0) {
    return false; // quote is never fresh by age alone
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
export function createIngestionPlan(
  assetId: string,
  ticker: string,
  coverage: Awaited<ReturnType<import("./stockCoverage.js").getStockCoverage>>,
  options: { refresh?: boolean; include?: DatasetName[] } = {},
): IngestionPlan {
  const steps: IngestionPlanStep[] = [];
  const requestedDatasets = options.include ?? [
    "profile",
    "quote",
    "history",
    "financial_statements",
    "financial_metrics",
    "insider_transactions",
    "institutional_holdings",
    "beneficial_ownership",
    "corporate_actions",
  ];

  // Priority order: profile first (identity), then quote, then history,
  // then fundamentals, then ownership/events
  const priorityOrder: Record<DatasetName, number> = {
    profile: 1,
    quote: 2,
    history: 3,
    financial_statements: 4,
    financial_metrics: 5,
    insider_transactions: 6,
    institutional_holdings: 7,
    beneficial_ownership: 8,
    corporate_actions: 9,
  };

  for (const dataset of requestedDatasets) {
    const datasetCoverage = coverage.datasets.find((d) => d.dataset === dataset);
    if (!datasetCoverage) continue;

    if (options.refresh || datasetCoverage.status === "missing" || datasetCoverage.status === "stale") {
      const policy = getFreshnessPolicy(dataset);
      steps.push({
        dataset,
        reason:
          datasetCoverage.status === "missing"
            ? "Dataset is missing."
            : datasetCoverage.status === "stale"
            ? `Dataset is stale (${policy.description})`
            : "Forced refresh requested.",
        priority: priorityOrder[dataset] ?? 10,
        estimatedRequests: estimateRequests(dataset),
        dependsOn: getDependencies(dataset),
      });
    }
  }

  // Sort by priority
  steps.sort((a, b) => a.priority - b.priority);

  return {
    assetId,
    ticker,
    steps,
    totalEstimatedRequests: steps.reduce((sum, s) => sum + s.estimatedRequests, 0),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Estimates the number of API requests needed for a dataset.
 * These are rough estimates for budgeting.
 */
function estimateRequests(dataset: DatasetName): number {
  switch (dataset) {
    case "profile":
      return 1; // FMP profile
    case "quote":
      return 1; // FMP quote
    case "history":
      return 3; // Chunked history requests (up to 3 windows for 1 year)
    case "financial_statements":
      return 1; // SEC companyfacts (single large payload)
    case "financial_metrics":
      return 0; // Computed locally from statements
    case "insider_transactions":
      return 5; // Up to 5 Form 3/4/5 filings
    case "institutional_holdings":
      return 4; // Up to 4 quarterly 13F filings
    case "beneficial_ownership":
      return 5; // Up to 5 13D/13G filings
    case "corporate_actions":
      return 5; // Up to 5 relevant filings
    default:
      return 2;
  }
}

/**
 * Returns dataset dependencies.
 * Some datasets require others to be collected first.
 */
function getDependencies(dataset: DatasetName): DatasetName[] {
  switch (dataset) {
    case "financial_metrics":
      return ["financial_statements"];
    case "history":
      return ["profile"]; // Need asset ID
    case "quote":
      return ["profile"];
    case "insider_transactions":
    case "institutional_holdings":
    case "beneficial_ownership":
    case "corporate_actions":
      return ["profile"]; // Need CIK from profile
    default:
      return [];
  }
}