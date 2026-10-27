import "dotenv/config";

import {
  loadCompanySubmissions,
  parseRecentFilings,
  type SecFiling,
  padCik,
  getRawFilingDocumentUrl,
  getFilingIndexUrl,
  rateLimitedFetch,
} from "../../collectors/assets/stocks/secEdgarFetch.js";
import { collectInsiderOwnership, type InsiderTransaction } from "../../collectors/assets/stocks/secInsiderOwnership.js";
import { collectManager13F, type ThirteenFPeriod } from "../../collectors/assets/stocks/sec13FHoldings.js";
import { collectBeneficialOwnership, type BeneficialOwnershipFiling } from "../../collectors/assets/stocks/secBeneficialOwnership.js";
import { collectCorporateActions, type CorporateActionFiling } from "../../collectors/assets/stocks/secCorporateActions.js";
import { extractDocumentText } from "../../collectors/assets/stocks/secDocumentText.js";
import { buildFilingEvidence, type FilingEvidence } from "../../collectors/assets/stocks/secEvidence.js";
import { toIsoDate } from "../../collectors/assets/stocks/secEdgarFetch.js";
import type {
  StockIdentity,
  InsiderTransaction as InsiderTransactionType,
  ThirteenFPeriod as ThirteenFPeriodType,
  BeneficialOwnershipFiling as BeneficialOwnershipFilingType,
  CorporateActionFiling as CorporateActionFilingType,
} from "../../types/stocks/stock.types.js";

/* -------------------------------------------------------------------------- */
/*                              Insider Transactions                          */
/* -------------------------------------------------------------------------- */

export interface InsiderCollectionResult {
  transactions: InsiderTransactionType[];
  errors: Array<{ form: string; accessionNumber: string; message: string }>;
  collectedAt: string;
}

/**
 * Collects insider transactions for a stock using the existing SEC collector.
 * Returns normalized transactions ready for storage.
 */
export async function collectInsiderTransactions(
  identity: StockIdentity,
  options: { maxFilings?: number; refreshSubmissions?: boolean } = {},
): Promise<InsiderCollectionResult> {
  if (!identity.cik) {
    return {
      transactions: [],
      errors: [{ form: "N/A", accessionNumber: "N/A", message: "No CIK available for insider collection." }],
      collectedAt: new Date().toISOString(),
    };
  }

  const report = await collectInsiderOwnership({
    cik: identity.cik,
    maxFilings: options.maxFilings ?? 20,
    forms: ["3", "4", "5"],
    includeAmendments: true,
    refreshSubmissions: options.refreshSubmissions ?? false,
  });

  // Convert to our internal type
  const transactions: InsiderTransactionType[] = report.transactions.map((tx) => ({
    form: tx.form,
    accessionNumber: tx.accessionNumber,
    filingDate: tx.filingDate,
    reportDate: tx.reportDate,
    documentUrl: tx.documentUrl,
    xmlUrl: tx.xmlUrl,
    issuerCik: tx.issuerCik,
    issuerName: tx.issuerName,
    issuerTradingSymbol: tx.issuerTradingSymbol,
    insiderCik: tx.insiderCik,
    insiderName: tx.insiderName,
    relationship: tx.relationship,
    table: tx.table,
    isHolding: tx.isHolding,
    lineNumber: tx.lineNumber,
    securityTitle: tx.securityTitle,
    transactionDate: tx.transactionDate,
    transactionCode: tx.transactionCode,
    transactionFormType: tx.transactionFormType,
    transactionType: tx.transactionType,
    transactionCategory: tx.transactionCategory,
    isOpenMarket: tx.isOpenMarket,
    equitySwapInvolved: tx.equitySwapInvolved,
    acquiredDisposedCode: tx.acquiredDisposedCode,
    shares: tx.shares,
    pricePerShare: tx.pricePerShare,
    transactionValue: tx.transactionValue,
    sharesOwnedFollowingTransaction: tx.sharesOwnedFollowingTransaction,
    directOrIndirectOwnership: tx.directOrIndirectOwnership,
    natureOfOwnership: tx.natureOfOwnership,
    underlyingSecurityTitle: tx.underlyingSecurityTitle,
    underlyingSecurityShares: tx.underlyingSecurityShares,
    conversionOrExercisePrice: tx.conversionOrExercisePrice,
    exerciseDate: tx.exerciseDate,
    expirationDate: tx.expirationDate,
    footnotes: tx.footnotes,
  }));

  return {
    transactions,
    errors: report.errors,
    collectedAt: report.generatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Institutional Holdings (13F)                      */
/* -------------------------------------------------------------------------- */

export interface InstitutionalHoldingsResult {
  periods: ThirteenFPeriodType[];
  errors: Array<{ accessionNumber: string; form: string; message: string }>;
  collectedAt: string;
}

/**
 * Collects 13F institutional holdings for a stock.
 * Note: 13F is filed by managers, not issuers. We use the bulk path to find
 * managers holding this stock's CUSIP.
 */
export async function collectInstitutionalHoldings(
  identity: StockIdentity,
  options: { maxPeriods?: number; cusip?: string; refreshSubmissions?: boolean } = {},
): Promise<InstitutionalHoldingsResult> {
  // For 13F, we need the issuer's CUSIP to find managers holding it
  // The existing collector has a bulk path for this
  // For now, we'll use the manager path with a known manager CIK if available
  // A more complete implementation would use the bulk data set

  // This is a placeholder - the full 13F bulk collection is complex
  // and requires a CUSIP-to-asset mapping
  return {
    periods: [],
    errors: [{ form: "13F", accessionNumber: "N/A", message: "13F bulk collection not yet integrated; use collector directly." }],
    collectedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*                       Beneficial Ownership (13D/13G)                       */
/* -------------------------------------------------------------------------- */

export interface BeneficialOwnershipResult {
  filings: BeneficialOwnershipFilingType[];
  errors: Array<{ form: string; accessionNumber: string; message: string }>;
  collectedAt: string;
}

/**
 * Collects 13D/13G beneficial ownership filings for a stock.
 */
export async function collectBeneficialOwnershipFilings(
  identity: StockIdentity,
  options: { maxFilings?: number; refreshSubmissions?: boolean; extract?: boolean } = {},
): Promise<BeneficialOwnershipResult> {
  if (!identity.cik) {
    return {
      filings: [],
      errors: [{ form: "N/A", accessionNumber: "N/A", message: "No CIK available for beneficial ownership collection." }],
      collectedAt: new Date().toISOString(),
    };
  }

  const report = await collectBeneficialOwnership({
    cik: identity.cik,
    maxFilings: options.maxFilings ?? 20,
    forms: ["13D", "13G"],
    includeAmendments: true,
    refreshSubmissions: options.refreshSubmissions ?? false,
    extract: options.extract ?? true,
  });

  // Convert to our internal type
  const filings: BeneficialOwnershipFilingType[] = report.filings.map((filing) => ({
    form: filing.form,
    scheduleType: filing.scheduleType,
    isAmendment: filing.isAmendment,
    amendmentNumber: filing.amendmentNumber,
    accessionNumber: filing.accessionNumber,
    filingDate: filing.filingDate,
    reportDate: filing.reportDate,
    eventDate: filing.eventDate,
    issuerName: filing.issuerName,
    issuerCik: filing.issuerCik,
    issuerCusip: filing.issuerCusip,
    securitiesClass: filing.securitiesClass,
    documentUrl: filing.documentUrl,
    filingIndexUrl: filing.filingIndexUrl,
    extractionStatus: filing.extractionStatus,
    reportingPersons: filing.reportingPersons,
    purposeOfTransaction: filing.purposeOfTransaction,
    sourceOfFunds: filing.sourceOfFunds,
    evidence: filing.evidence,
    extractionUsage: filing.extractionUsage,
  }));

  return {
    filings,
    errors: report.errors,
    collectedAt: report.generatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/*                           Corporate Actions                                */
/* -------------------------------------------------------------------------- */

export interface CorporateActionsResult {
  filings: CorporateActionFilingType[];
  errors: Array<{ form: string; accessionNumber: string; message: string }>;
  collectedAt: string;
}

/**
 * Collects corporate action filings for a stock.
 */
export async function collectCorporateActionFilings(
  identity: StockIdentity,
  options: { maxFilings?: number; since?: string; refreshSubmissions?: boolean; extract?: boolean } = {},
): Promise<CorporateActionsResult> {
  if (!identity.cik) {
    return {
      filings: [],
      errors: [{ form: "N/A", accessionNumber: "N/A", message: "No CIK available for corporate actions collection." }],
      collectedAt: new Date().toISOString(),
    };
  }

  const report = await collectCorporateActions({
    cik: identity.cik,
    maxFilings: options.maxFilings ?? 12,
    forms: [
      "8-K", "S-1", "S-3", "424B1", "424B3", "424B5",
      "SC TO-T", "SC TO-I", "DEFM14A", "PREM14A", "DEF 14A",
    ],
    refreshSubmissions: options.refreshSubmissions ?? false,
    since: options.since ?? null,
    extract: options.extract ?? true,
  });

  // Convert to our internal type
  const filings: CorporateActionFilingType[] = report.filings.map((filing) => ({
    form: filing.form,
    tier: filing.tier,
    accessionNumber: filing.accessionNumber,
    filingDate: filing.filingDate,
    reportDate: filing.reportDate,
    primaryDocDescription: filing.primaryDocDescription,
    documentUrl: filing.documentUrl,
    filingIndexUrl: filing.filingIndexUrl,
    extractionStatus: filing.extractionStatus,
    event: filing.event,
    documentChars: filing.documentChars,
    documentTruncated: filing.documentTruncated,
    evidence: filing.evidence,
    extractionUsage: filing.extractionUsage,
  }));

  return {
    filings,
    errors: report.errors,
    collectedAt: report.generatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/*                         Financial Statements (SEC)                         */
/* -------------------------------------------------------------------------- */

import { loadAndNormalizeFacts, normalizeQuarterlyYTD, calculateRatios, type RatioResult } from "../../collectors/assets/stocks/fundamentalsCollector.js";
import type { FinancialStatements, FinancialMetrics, FinancialStatementPeriod, FinancialMetricsPeriod } from "../../../types/stocks/stock.types.js";

export interface FundamentalsResult {
  statements: FinancialStatements | null;
  metrics: FinancialMetrics | null;
  error: string | null;
  collectedAt: string;
}

/**
 * Loads and normalizes SEC company facts for a stock.
 * This reads from the cached companyfacts JSON file.
 */
export async function collectFundamentals(
  identity: StockIdentity,
  options: { refreshCompanyFacts?: boolean } = {},
): Promise<FundamentalsResult> {
  if (!identity.cik) {
    return {
      statements: null,
      metrics: null,
      error: "No CIK available for fundamentals collection.",
      collectedAt: new Date().toISOString(),
    };
  }

  try {
    // Load company facts from cached file (the collector fetches it)
    const cikNumber = identity.cik.replace(/^0+/, "");
    const filePath = `collectors/assets/data/Edgar companyfacts_CIK${cikNumber}.json`;

    // Use the existing fundamentals collector logic
    const { cik, entityName, facts } = loadAndNormalizeFacts(filePath);
    const groups = new Map<string, ReturnType<typeof loadAndNormalizeFacts>["facts"]>();

    // Group by fiscal period (reuse logic from fundamentalsCollector)
    const periodGroups = new Map<string, typeof facts>();
    for (const fact of facts) {
      const key = `${fact.fy}|${fact.fp}`;
      if (!periodGroups.has(key)) periodGroups.set(key, []);
      periodGroups.get(key)!.push(fact);
    }

    const normalized = normalizeQuarterlyYTD(periodGroups);
    const ratios = calculateRatios(normalized);

    // Build FinancialStatements
    const statementPeriods: FinancialStatementPeriod[] = [];
    for (const [key, data] of normalized) {
      const [fyStr, period] = key.split("|") as [string, "FY" | "Q1" | "Q2" | "Q3" | "Q4"];
      const fy = parseInt(fyStr, 10);

      const concepts: Record<string, FinancialStatements["annual"][0]["concepts"][string]> = {};
      for (const [concept, value] of data) {
        // We need to find the original fact for metadata
        const sourceFact = facts.find(
          (f) => f.concept === concept && f.fy === fy && f.fp === period,
        );
        if (sourceFact) {
          concepts[concept] = {
            concept,
            value,
            unit: sourceFact.unit,
            periodEnd: sourceFact.periodEnd,
            filingDate: sourceFact.filingDate,
            accessionNumber: sourceFact.accessionNumber,
            form: sourceFact.form,
          };
        }
      }

      statementPeriods.push({
        fy,
        period: period as FinancialStatementPeriod["period"],
        concepts,
      });
    }

    const statements: FinancialStatements = {
      annual: statementPeriods.filter((p) => p.period === "FY"),
      quarterly: statementPeriods.filter((p) => p.period !== "FY"),
      source: "sec_companyfacts",
      cik,
      entityName,
      normalizedAt: new Date().toISOString(),
    };

    // Build FinancialMetrics
    const metricPeriods: FinancialMetricsPeriod[] = ratios.map((r) => ({
      fy: r.fy,
      period: r.period,
      grossMargin: r.grossMargin,
      operatingMargin: r.operatingMargin,
      netMargin: r.netMargin,
      currentRatio: r.currentRatio,
      debtToEquity: r.debtToEquity,
      freeCashFlow: r.freeCashFlow,
      returnOnAssets: r.returnOnAssets,
      returnOnEquity: r.returnOnEquity,
      revenueGrowth: r.revenueGrowth,
    }));

    const metrics: FinancialMetrics = {
      periods: metricPeriods,
      source: "sec_companyfacts",
      cik,
      computedAt: new Date().toISOString(),
    };

    return {
      statements,
      metrics,
      error: null,
      collectedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      statements: null,
      metrics: null,
      error: message,
      collectedAt: new Date().toISOString(),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                              Helper: Read CIK                              */
/* -------------------------------------------------------------------------- */

export async function resolveCikFromTicker(ticker: string): Promise<string | null> {
  const { loadCompanyTickersExchange, padCik } = await import("../../collectors/assets/stocks/secEdgarFetch.js");
  const data = await loadCompanyTickersExchange();
  const normalized = ticker.trim().toUpperCase();

  for (const row of data.data) {
    if (row[2].toUpperCase() === normalized) {
      return padCik(row[0]);
    }
  }
  return null;
}