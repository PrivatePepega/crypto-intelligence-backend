import { z } from "zod";

/** Database client interface for coverage and repository queries. */
export interface DbClient {
  query(text: string, values?: unknown[]): Promise<{
    rows: Array<Record<string, unknown>>;
    rowCount: number | null;
  }>;
}

/**
 * Stock intelligence types for the deterministic ingestion service.
 *
 * These types describe the canonical shapes used by the stock resolver,
 * coverage checker, ingestion planner, normalizers, and repositories.
 * They are separate from provider-specific schemas so the service layer
 * never depends on FMP or SEC field names directly.
 */

/* -------------------------------------------------------------------------- */
/*                                  Identity                                  */
/* -------------------------------------------------------------------------- */

/** Provider-agnostic canonical stock identifier. */
export interface StockIdentity {
  /** Our canonical asset UUID. */
  assetId: string;
  /** Primary listing ticker (e.g., AAPL). */
  ticker: string;
  /** Legal company name. */
  companyName: string;
  /** Primary exchange (e.g., NASDAQ, NYSE). */
  exchange: string | null;
  /** SEC CIK, 10-digit zero-padded (e.g., 0000320193). */
  cik: string | null;
  /** Provider-specific identifiers, keyed by provider. */
  providerIds: Record<string, Record<string, unknown>>;
}

/** Result of resolving a user query to a canonical stock. */
export type StockResolutionResult =
  | { kind: "resolved"; identity: StockIdentity }
  | { kind: "not_found"; message: string }
  | { kind: "ambiguous"; candidates: StockIdentity[]; message: string };

/** Lightweight candidate for autocomplete/search. */
export interface StockSearchCandidate {
  ticker: string;
  companyName: string;
  exchange: string | null;
  cik: string | null;
  provider: "fmp" | "sec";
  providerSymbol: string;
}

/* -------------------------------------------------------------------------- */
/*                              Provider Inputs                               */
/* -------------------------------------------------------------------------- */

/** FMP search-symbol response item. */
export const fmpSearchSymbolItemSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  name: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  exchangeFullName: z.string().nullable().optional(),
  exchange: z.string().nullable().optional(),
});

export type FmpSearchSymbolItem = z.infer<typeof fmpSearchSymbolItemSchema>;
export type FmpSearchSymbolResponse = z.infer<typeof fmpSearchSymbolItemSchema>[];

/** FMP quote response item (from /quote endpoint). */
export const fmpQuoteItemSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  name: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  changePercentage: z.number().nullable().optional(),
  change: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
  averageVolume: z.number().nullable().optional(),
  dayLow: z.number().nullable().optional(),
  dayHigh: z.number().nullable().optional(),
  yearHigh: z.number().nullable().optional(),
  yearLow: z.number().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  priceAvg50: z.number().nullable().optional(),
  priceAvg200: z.number().nullable().optional(),
  exchange: z.string().nullable().optional(),
  open: z.number().nullable().optional(),
  previousClose: z.number().nullable().optional(),
  timestamp: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
});

export type FmpQuoteItem = z.infer<typeof fmpQuoteItemSchema>;
export type FmpQuoteResponse = z.infer<typeof fmpQuoteItemSchema>[];

/** FMP search-name response item. */
export const fmpSearchNameItemSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  name: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  exchangeFullName: z.string().nullable().optional(),
  exchange: z.string().nullable().optional(),
});

export type FmpSearchNameItem = z.infer<typeof fmpSearchNameItemSchema>;
export type FmpSearchNameResponse = z.infer<typeof fmpSearchNameItemSchema>[];

/** FMP profile response item. */
export const fmpProfileItemSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  price: z.number().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  beta: z.number().nullable().optional(),
  lastDividend: z.number().nullable().optional(),
  range: z.string().nullable().optional(),
  change: z.number().nullable().optional(),
  changePercentage: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
  averageVolume: z.number().nullable().optional(),
  companyName: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  cik: z.string().nullable().optional(),
  isin: z.string().nullable().optional(),
  cusip: z.string().nullable().optional(),
  exchangeFullName: z.string().nullable().optional(),
  exchange: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  ceo: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  fullTimeEmployees: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  ipoDate: z.string().nullable().optional(),
  defaultImage: z.boolean().nullable().optional(),
  isEtf: z.boolean().nullable().optional(),
  isActivelyTrading: z.boolean().nullable().optional(),
  isAdr: z.boolean().nullable().optional(),
  isFund: z.boolean().nullable().optional(),
});

export type FmpProfileItem = z.infer<typeof fmpProfileItemSchema>;
export type FmpProfileResponse = z.infer<typeof fmpProfileItemSchema>[];

/** FMP historical price EOD response item. */
export const fmpHistoricalPriceEodItemSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  date: z.string().trim().min(10).max(10),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullable().optional(),
  change: z.number().nullable().optional(),
  changePercent: z.number().nullable().optional(),
  vwap: z.number().nullable().optional(),
});

export type FmpHistoricalPriceEodItem = z.infer<typeof fmpHistoricalPriceEodItemSchema>;
export type FmpHistoricalPriceEodResponse = z.infer<typeof fmpHistoricalPriceEodItemSchema>[];

/** SEC company_tickers_exchange.json row. */
export const secTickerExchangeRowSchema = z.tuple([
  z.number().int().positive(), // cik
  z.string(), // name
  z.string(), // ticker
  z.string(), // exchange
]);

export type SecTickerExchangeRow = z.infer<typeof secTickerExchangeRowSchema>;

export const secTickerExchangeSchema = z.object({
  fields: z.array(z.string()),
  data: z.array(secTickerExchangeRowSchema),
});

export type SecTickerExchangeData = z.infer<typeof secTickerExchangeSchema>;

/* -------------------------------------------------------------------------- */
/*                            Normalized Stock Data                           */
/* -------------------------------------------------------------------------- */

/** Normalized stock profile (merged FMP + SEC identity). */
export interface StockProfile {
  assetId: string;
  ticker: string;
  companyName: string;
  exchange: string | null;
  cik: string | null;
  isin: string | null;
  cusip: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  country: string | null;
  ipoDate: string | null;
  currency: string | null;
  isEtf: boolean | null;
  isFund: boolean | null;
  isAdr: boolean | null;
  isActivelyTrading: boolean | null;
  providerData: Record<string, unknown>; // raw FMP profile for audit
  updatedAt: string; // ISO timestamp of last normalization
}

/** Normalized current quote / market snapshot. */
export interface StockQuote {
  provider: "fmp";
  symbol: string;
  providerSymbol: string;
  name: string | null;
  price: number;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  previousClose: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  yearLow: number | null;
  yearHigh: number | null;
  volume: number | null;
  averageVolume: number | null;
  marketCap: number | null;
  priceAvg50: number | null;
  priceAvg200: number | null;
  currency: string | null;
  exchange: string | null;
  observedAt: string | null; // provider quote timestamp
  collectedAt: string; // collector timestamp
  providerRaw: unknown;
}

/** Normalized daily OHLC candle. */
export interface StockCandle {
  symbol: string;
  date: string; // YYYY-MM-DD (trading date)
  timestamp: string; // date at UTC midnight, ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  change: number | null;
  changePercent: number | null;
  vwap: number | null;
}

export interface StockHistory {
  provider: "fmp";
  symbol: string;
  interval: "1d";
  fetchedAt: string;
  requested: { from: string | null; to: string | null };
  candles: StockCandle[];
  rejected: Array<{ date: string | null; reason: string }>;
  duplicatesRemoved: number;
}

/* -------------------------------------------------------------------------- */
/*                           Financial Statements                             */
/* -------------------------------------------------------------------------- */

export type StatementPeriod = "FY" | "Q1" | "Q2" | "Q3" | "Q4";

export interface FinancialStatementConcept {
  concept: string;
  value: number | null;
  unit: string;
  periodEnd: string;
  filingDate: string;
  accessionNumber: string;
  form: string;
}

export interface FinancialStatementPeriod {
  fy: number;
  period: StatementPeriod;
  concepts: Record<string, FinancialStatementConcept>;
}

export interface FinancialStatements {
  annual: FinancialStatementPeriod[];
  quarterly: FinancialStatementPeriod[];
  source: "sec_companyfacts";
  cik: string;
  entityName: string;
  normalizedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                              Financial Metrics                             */
/* -------------------------------------------------------------------------- */

export interface FinancialMetricsPeriod {
  fy: number;
  period: StatementPeriod;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  currentRatio: number | null;
  debtToEquity: number | null;
  freeCashFlow: number | null;
  returnOnAssets: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  // Additional computed metrics can be added here
}

export interface FinancialMetrics {
  periods: FinancialMetricsPeriod[];
  source: "sec_companyfacts";
  cik: string;
  computedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                            Insider Transactions                            */
/* -------------------------------------------------------------------------- */

export type InsiderTransactionType =
  | "purchase"
  | "sale"
  | "award"
  | "optionExercise"
  | "conversion"
  | "taxWithholding"
  | "dispositionToIssuer"
  | "gift"
  | "holding"
  | "other";

export type InsiderTransactionCategory = "acquisition" | "disposition" | null;

export interface InsiderRelationship {
  isDirector: boolean | null;
  isOfficer: boolean | null;
  isTenPercentOwner: boolean | null;
  isOther: boolean | null;
  officerTitle: string | null;
}

export interface InsiderTransaction {
  form: string;
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  documentUrl: string;
  xmlUrl: string;
  issuerCik: string | null;
  issuerName: string | null;
  issuerTradingSymbol: string | null;
  insiderCik: string | null;
  insiderName: string | null;
  relationship: InsiderRelationship;
  table: "nonDerivative" | "derivative";
  isHolding: boolean;
  lineNumber: number;
  securityTitle: string | null;
  transactionDate: string | null;
  transactionCode: string | null;
  transactionFormType: string | null;
  transactionType: InsiderTransactionType;
  transactionCategory: InsiderTransactionCategory;
  isOpenMarket: boolean;
  equitySwapInvolved: boolean | null;
  acquiredDisposedCode: "A" | "D" | null;
  shares: number | null;
  pricePerShare: number | null;
  transactionValue: number | null;
  sharesOwnedFollowingTransaction: number | null;
  directOrIndirectOwnership: "D" | "I" | null;
  natureOfOwnership: string | null;
  underlyingSecurityTitle: string | null;
  underlyingSecurityShares: number | null;
  conversionOrExercisePrice: number | null;
  exerciseDate: string | null;
  expirationDate: string | null;
  footnotes: string[];
}

/* -------------------------------------------------------------------------- */
/*                          Institutional Holdings (13F)                      */
/* -------------------------------------------------------------------------- */

export type ThirteenFValueUnit = "USD" | "USD_THOUSANDS";

export interface ThirteenFVotingAuthority {
  sole: number | null;
  shared: number | null;
  none: number | null;
}

export interface ThirteenFHolding {
  cusip: string;
  nameOfIssuer: string;
  titleOfClass: string;
  putCall: string | null;
  shares: number | null;
  shareType: string | null;
  valueAsReported: number | null;
  valueUnit: ThirteenFValueUnit | null;
  valueUnitSource: "sec_filing_date_rule";
  valueUnitMixed: boolean;
  valueUsd: number | null;
  impliedPricePerShare: number | null;
  investmentDiscretions: string[];
  otherManagers: string[];
  votingAuthority: ThirteenFVotingAuthority;
  entryCount: number;
  filingDate: string;
  reportPeriod: string;
  accessionNumber: string;
  form: string;
  amendmentType: "RESTATEMENT" | "NEW HOLDINGS" | "OTHER" | null;
  filingRefs: Array<{
    accessionNumber: string;
    filingDate: string;
    form: string;
    amendmentType: "RESTATEMENT" | "NEW HOLDINGS" | "OTHER" | null;
  }>;
  assetId: string | null;
  assetResolution: "mapped" | "unmapped";
  ticker: string | null;
  name: string | null;
}

export interface ThirteenFPeriod {
  reportPeriod: string;
  holdings: ThirteenFHolding[];
  filings: Array<{
    form: string;
    accessionNumber: string;
    filingDate: string;
    isAmendment: boolean;
    amendmentType: "RESTATEMENT" | "NEW HOLDINGS" | "OTHER" | null;
    informationTableUrl: string | null;
  }>;
  totals: {
    positions: number;
    valueUsd: number;
    sharesByType: Record<string, number>;
  };
}

/* -------------------------------------------------------------------------- */
/*                       Beneficial Ownership (13D/13G)                       */
/* -------------------------------------------------------------------------- */

export type ScheduleType = "13D" | "13G";

export interface BeneficialOwnershipPerson {
  name: string;
  cik: string | null;
  citizenshipOrOrganization: string | null;
  soleVotingPower: number | null;
  sharedVotingPower: number | null;
  soleDispositivePower: number | null;
  sharedDispositivePower: number | null;
  aggregateAmountOwned: number | null;
  percentOfClass: number | null;
  typeOfReportingPerson: string | null;
  memberOfGroup: string | null;
  fundType: string | null;
}

export interface BeneficialOwnershipFiling {
  form: string;
  scheduleType: ScheduleType;
  isAmendment: boolean;
  amendmentNumber: number | null;
  accessionNumber: string;
  filingDate: string;
  reportDate: string | null;
  eventDate: string | null;
  issuerName: string | null;
  issuerCik: string | null;
  issuerCusip: string | null;
  securitiesClass: string | null;
  documentUrl: string;
  filingIndexUrl: string;
  extractionStatus: "xml" | "ai" | "skipped";
  reportingPersons: BeneficialOwnershipPerson[];
  purposeOfTransaction: string | null;
  sourceOfFunds: string | null;
}

/* -------------------------------------------------------------------------- */
/*                           Corporate Actions                                */
/* -------------------------------------------------------------------------- */

export type CorporateActionEventType =
  | "merger_acquisition"
  | "spin_off"
  | "stock_split"
  | "reverse_split"
  | "dividend_announcement"
  | "share_buyback"
  | "secondary_offering"
  | "debt_offering"
  | "tender_offer"
  | "executive_change"
  | "bankruptcy"
  | "material_agreement"
  | "other"
  | "not_corporate_action";

export interface CorporateActionEvent {
  isCorporateAction: boolean;
  eventType: CorporateActionEventType;
  summary: string;
  parties: Array<{ name: string; role: string }>;
  eventDate: string | null;
  amounts: Array<{ label: string; value: number; currency: string | null; unit: string | null }>;
  financialImplications: string;
  confidence: "low" | "medium" | "high";
}

export interface CorporateActionFiling {
  form: string;
  tier: number;
  accessionNumber: string;
  filingDate: string;
  reportDate: string | null;
  primaryDocDescription: string;
  documentUrl: string;
  filingIndexUrl: string;
  extractionStatus: "ai" | "skipped" | "failed";
  event: CorporateActionEvent | null;
  documentChars: number | null;
  documentTruncated: boolean;
}

/* -------------------------------------------------------------------------- */
/*                         Coverage & Freshness                               */
/* -------------------------------------------------------------------------- */

export type DatasetStatus =
  | "missing"
  | "fresh"
  | "stale"
  | "partial"
  | "failed";

export interface DatasetCoverage {
  dataset: string;
  status: DatasetStatus;
  lastCollectedAt: string | null;
  lastSuccessfulAt: string | null;
  latestSourceDate: string | null; // e.g., latest filing date, latest candle date
  freshnessPolicy: string; // human-readable policy description
  recordCount: number;
  error: string | null;
}

export interface StockCoverageReport {
  assetId: string;
  ticker: string;
  datasets: DatasetCoverage[];
  overallFresh: boolean;
  collectedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                           Ingestion Planning                               */
/* -------------------------------------------------------------------------- */

export type DatasetName =
  | "profile"
  | "quote"
  | "history"
  | "financial_statements"
  | "financial_metrics"
  | "insider_transactions"
  | "institutional_holdings"
  | "beneficial_ownership"
  | "corporate_actions";

export interface IngestionPlanStep {
  dataset: DatasetName;
  reason: string;
  priority: number; // lower = higher priority
  estimatedRequests: number;
  dependsOn: DatasetName[];
}

export interface IngestionPlan {
  assetId: string;
  ticker: string;
  steps: IngestionPlanStep[];
  totalEstimatedRequests: number;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                          Service Input/Output                              */
/* -------------------------------------------------------------------------- */

export interface GetOrIngestStockOptions {
  /** Force refresh even if data appears fresh. */
  refresh: boolean | undefined;
  /** Only include these datasets in the response (default: all available). */
  include: DatasetName[] | undefined;
  /** Skip ingestion entirely; only read from DB. */
  readOnly: boolean | undefined;
}

export interface StockIntelligenceResult {
  identity: StockIdentity;
  profile: StockProfile | null;
  quote: StockQuote | null;
  history: StockHistory | null;
  financialStatements: FinancialStatements | null;
  financialMetrics: FinancialMetrics | null;
  insiderTransactions: InsiderTransaction[];
  institutionalHoldings: ThirteenFPeriod[];
  beneficialOwnership: BeneficialOwnershipFiling[];
  corporateActions: CorporateActionFiling[];
  coverage: StockCoverageReport;
  errors: Array<{ dataset: DatasetName; message: string }>;
}