/**
 * Simple Response Mapper
 *
 * Maps the full StockIntelligenceServiceResult to the simplified
 * SimpleStockIntelligenceResponse contract.
 *
 * Only extracts: ticker, company, market, financialReports, dataUpdatedAt
 * Excludes: history, financialMetrics, SEC events, coverage diagnostics, internal identity
 */

import type { StockIntelligenceServiceResult } from "../../types/stocks/api.types.js";
import type {
  SimpleStockIntelligenceResponse,
  SimpleFinancialReport,
} from "../../types/stocks/simpleResponse.types.js";
import { createEmptyFinancialReport } from "../../types/stocks/simpleResponse.types.js";

/**
 * Extracts a single financial concept value from stored statement periods.
 */
function getConceptValue(
  periods: Array<{ fy: number; period: string; concepts: Record<string, { value: number | null }> }>,
  conceptName: string,
  preferLatest: boolean = true,
): number | null {
  // Filter periods that have the concept with a non-null value
  const withValue = periods
    .filter((p) => p.concepts[conceptName]?.value !== null && p.concepts[conceptName]?.value !== undefined)
    .map((p) => ({
      fy: p.fy,
      period: p.period,
      value: p.concepts[conceptName]!.value as number,
    }));

  if (withValue.length === 0) return null;

  if (preferLatest) {
    // Sort by fiscal year desc, then period order (FY > Q4 > Q3 > Q2 > Q1)
    const periodOrder: Record<string, number> = { FY: 5, Q4: 4, Q3: 3, Q2: 2, Q1: 1 };
    withValue.sort((a, b) => {
      if (b.fy !== a.fy) return b.fy - a.fy;
      return (periodOrder[b.period] ?? 0) - (periodOrder[a.period] ?? 0);
    });
    return withValue[0]!.value;
  }

  return withValue[0]!.value;
}

/**
 * Finds the latest valid 10-Q period (quarterly report).
 */
function findLatestQuarterlyPeriod(
  statements: NonNullable<StockIntelligenceServiceResult["financialStatements"]>,
): { fy: number; period: string; periodEnd: string; filingDate: string; accessionNumber: string } | null {
  const quarterly = statements.quarterly
    .filter((p) => p.period !== "FY")
    .filter((p) => {
      // Only consider periods that have at least revenue or net income
      const revenue = p.concepts["RevenueFromContractWithCustomerExcludingAssessedTax"]?.value ??
        p.concepts["Revenues"]?.value;
      const netIncome = p.concepts["NetIncomeLoss"]?.value;
      return revenue !== null || netIncome !== null;
    });

  if (quarterly.length === 0) return null;

  // Sort by period end date descending (most recent first)
  quarterly.sort((a, b) => {
    const aConcepts = Object.values(a.concepts);
    const bConcepts = Object.values(b.concepts);
    const aEnd = aConcepts[0]?.periodEnd ?? "";
    const bEnd = bConcepts[0]?.periodEnd ?? "";
    return bEnd.localeCompare(aEnd);
  });

  const latest = quarterly[0];
  if (!latest) return null;

  // Get the accession number and filing date from any concept that has it
  let accessionNumber = "";
  let filingDate = "";
  for (const concept of Object.values(latest.concepts)) {
    if (concept.accessionNumber) {
      accessionNumber = concept.accessionNumber;
      filingDate = concept.filingDate;
      break;
    }
  }

  const firstConcept = Object.values(latest.concepts)[0];
  return {
    fy: latest.fy,
    period: latest.period,
    periodEnd: firstConcept?.periodEnd ?? "",
    filingDate,
    accessionNumber,
  };
}

/**
 * Finds the latest valid 10-K period (annual report).
 */
function findLatestAnnualPeriod(
  statements: NonNullable<StockIntelligenceServiceResult["financialStatements"]>,
): { fy: number; period: string; periodEnd: string; filingDate: string; accessionNumber: string } | null {
  const annual = statements.annual.filter((p) => {
    const revenue = p.concepts["RevenueFromContractWithCustomerExcludingAssessedTax"]?.value ??
      p.concepts["Revenues"]?.value;
    const netIncome = p.concepts["NetIncomeLoss"]?.value;
    return revenue !== null || netIncome !== null;
  });

  if (annual.length === 0) return null;

  // Sort by fiscal year descending
  annual.sort((a, b) => b.fy - a.fy);

  const latest = annual[0];
  if (!latest) return null;

  let accessionNumber = "";
  let filingDate = "";
  for (const concept of Object.values(latest.concepts)) {
    if (concept.accessionNumber) {
      accessionNumber = concept.accessionNumber;
      filingDate = concept.filingDate;
      break;
    }
  }

  const firstConcept = Object.values(latest.concepts)[0];
  return {
    fy: latest.fy,
    period: "FY",
    periodEnd: firstConcept?.periodEnd ?? "",
    filingDate,
    accessionNumber,
  };
}

/**
 * Builds a financial report from the latest period and statement data.
 */
function buildFinancialReport(
  latestPeriod: { fy: number; period: string; periodEnd: string; filingDate: string; accessionNumber: string } | null,
  statements: NonNullable<StockIntelligenceServiceResult["financialStatements"]>,
  form: "10-Q" | "10-K",
): SimpleFinancialReport {
  if (!latestPeriod) {
    return createEmptyFinancialReport(form);
  }

  // Get all periods (annual + quarterly) to search for values
  const allPeriods = [...statements.annual, ...statements.quarterly];

  return {
    form,
    fiscalYear: latestPeriod.fy,
    fiscalPeriod: form === "10-Q" ? latestPeriod.period : "FY",
    periodEnd: latestPeriod.periodEnd || null,
    filingDate: latestPeriod.filingDate || null,
    accessionNumber: latestPeriod.accessionNumber || null,
    currency: "USD",
    revenue: getConceptValue(allPeriods, "RevenueFromContractWithCustomerExcludingAssessedTax") ??
      getConceptValue(allPeriods, "Revenues"),
    grossProfit: getConceptValue(allPeriods, "GrossProfit"),
    operatingIncome: getConceptValue(allPeriods, "OperatingIncomeLoss"),
    netIncome: getConceptValue(allPeriods, "NetIncomeLoss"),
    totalAssets: getConceptValue(allPeriods, "Assets"),
    totalLiabilities: getConceptValue(allPeriods, "Liabilities"),
    cashAndCashEquivalents: getConceptValue(allPeriods, "CashAndCashEquivalentsAtCarryingValue"),
    operatingCashFlow: getConceptValue(allPeriods, "NetCashProvidedByUsedInOperatingActivities"),
    capitalExpenditures: getConceptValue(allPeriods, "PaymentsToAcquirePropertyPlantAndEquipment"),
    freeCashFlow: (() => {
      const ocf = getConceptValue(allPeriods, "NetCashProvidedByUsedInOperatingActivities");
      const capex = getConceptValue(allPeriods, "PaymentsToAcquirePropertyPlantAndEquipment");
      if (ocf !== null && capex !== null) return ocf - Math.abs(capex);
      return null;
    })(),
    sourceUrl: latestPeriod.accessionNumber
      ? `https://www.sec.gov/Archives/edgar/data/${statements.cik}/${latestPeriod.accessionNumber.replace(/-/g, "")}/index.html`
      : null,
  };
}

/**
 * Maps the full service result to the simplified response contract.
 */
export function mapToSimpleResponse(
  result: StockIntelligenceServiceResult,
): SimpleStockIntelligenceResponse {
  const { identity, profile, quote, financialStatements } = result;

  // --- Company ---
  const company = {
    name: profile?.companyName ?? identity.companyName ?? identity.ticker,
    exchange: profile?.exchange ?? null,
    currency: quote?.currency ?? "USD",
    cik: identity.cik ?? "",
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    description: profile?.description ?? null,
    website: profile?.website ?? null,
    country: "US", // Could be derived from profile if available
    logoUrl: null, // Not currently stored
  };

  // --- Market ---
  const market = {
    price: quote?.price ?? null,
    previousClose: quote?.previousClose ?? null,
    change: quote?.change ?? null,
    changePercent: quote?.changePercent ?? null,
    marketCap: quote?.marketCap ?? null,
    volume: quote?.volume ?? null,
    averageVolume: quote?.averageVolume ?? null,
    dayHigh: quote?.dayHigh ?? null,
    dayLow: quote?.dayLow ?? null,
    yearHigh: quote?.yearHigh ?? null,
    yearLow: quote?.yearLow ?? null,
    priceUpdatedAt: quote?.observedAt ?? null,
  };

  // --- Financial Reports ---
  let financialReports = {
    latestQuarterly: createEmptyFinancialReport("10-Q"),
    latestAnnual: createEmptyFinancialReport("10-K"),
  };

  if (financialStatements) {
    const latestQuarterly = findLatestQuarterlyPeriod(financialStatements);
    const latestAnnual = findLatestAnnualPeriod(financialStatements);

    financialReports = {
      latestQuarterly: buildFinancialReport(latestQuarterly, financialStatements, "10-Q"),
      latestAnnual: buildFinancialReport(latestAnnual, financialStatements, "10-K"),
    };
  }

  // --- dataUpdatedAt ---
  // Use the most recent timestamp from available data sources
  const timestamps = [
    quote?.collectedAt,
    profile?.updatedAt,
    financialStatements?.normalizedAt,
  ].filter((t): t is string => !!t);

  const dataUpdatedAt = timestamps.length > 0
    ? timestamps.reduce((latest, current) => (current > latest ? current : latest))
    : null;

  return {
    ticker: identity.ticker,
    company,
    market,
    financialReports,
    dataUpdatedAt,
  };
}

// Re-export for convenience
export { createEmptyFinancialReport, createEmptyResponse } from "../../types/stocks/simpleResponse.types.js";