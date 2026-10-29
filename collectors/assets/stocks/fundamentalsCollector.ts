import fs from "node:fs";
import path from "node:path";
import { OUTPUT_DIR } from "./secEdgarFetch.js";

/**
 * SEC Edgar Fundamentals Collector
 *
 * Reads the saved companyfacts JSON, normalizes annual and quarterly
 * periods, and calculates financial ratios using deterministic code.
 *
 * Run with: npx tsx collectors/assets/fundamentalsCollector.ts
 */

const INPUT_PATH = path.join(OUTPUT_DIR, "Edgar companyfacts_CIK320193.json");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "fundamentals_AAPL.json");

interface RawFact {
  start: string;
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame: string;
  unit: string;
}

interface NormalizedFact {
  concept: string;
  fy: number;
  fp: "FY" | "Q1" | "Q2" | "Q3" | "Q4";
  periodEnd: string;
  filingDate: string;
  accessionNumber: string;
  form: string;
  value: number | null;
  unit: string;
}

export interface RatioResult {
  fy: number;
  period: "FY" | "Q1" | "Q2" | "Q3" | "Q4";
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  currentRatio: number | null;
  debtToEquity: number | null;
  freeCashFlow: number | null;
  returnOnAssets: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
}

const KEY_CONCEPTS = [
  // Revenue - Apple uses RevenueFromContractWithCustomerExcludingAssessedTax
  // in later years, not Revenues (which only has FY2018 data)
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "GrossProfit",
  "OperatingIncomeLoss",
  "NetIncomeLoss",
  "Assets",
  "Liabilities",
  "StockholdersEquity",
  "AssetsCurrent",
  "LiabilitiesCurrent",
  "LongTermDebt",
  "LongTermDebtCurrent",
  "CashAndCashEquivalentsAtCarryingValue",
  "NetCashProvidedByUsedInOperatingActivities",
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "InventoryNet",
  "AccountsReceivableNetCurrent",
] as const;

type KeyConcept = (typeof KEY_CONCEPTS)[number];

/**
 * Loads and parses the companyfacts JSON, extracting key concepts
 * into normalized facts with fiscal period metadata.
 */
export function loadAndNormalizeFacts(inputPath: string): {
  cik: string;
  entityName: string;
  facts: NormalizedFact[];
} {
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const usgaap = raw.facts?.["us-gaap"] as Record<string, any>;

  const normalized: NormalizedFact[] = [];

  for (const concept of KEY_CONCEPTS) {
    const entry = usgaap[concept];
    if (!entry || !entry.units?.USD) {
      continue;
    }

    for (const rawFact of entry.units.USD as RawFact[]) {
      normalized.push({
        concept,
        fy: rawFact.fy,
        fp: rawFact.fp as "FY" | "Q1" | "Q2" | "Q3" | "Q4",
        periodEnd: rawFact.end,
        filingDate: rawFact.filed,
        accessionNumber: rawFact.accn,
        form: rawFact.form,
        value: rawFact.val,
        unit: "USD",
      });
    }
  }

  return {
    cik: raw.cik,
    entityName: raw.entityName,
    facts: normalized,
  };
}

/**
 * Groups normalized facts by fiscal year and period type.
 * When multiple entries exist for the same fy|fp|concept, keeps the one
 * with the latest filing date (most recent filing).
 */
function groupByFiscalPeriod(facts: NormalizedFact[]): Map<string, NormalizedFact[]> {
  const groups = new Map<string, NormalizedFact[]>();
  for (const fact of facts) {
    const key = `${fact.fy}|${fact.fp}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(fact);
  }
  return groups;
}

/**
 * Gets a fact value by concept from a group of facts.
 * When multiple entries exist for the same concept in the same group,
 * returns the one with the latest filing date.
 * Returns null if the concept is not found (treated as unknown, not zero).
 */
function getFactByConcept(group: NormalizedFact[], concept: string): number | null {
  const matches = group.filter((f) => f.concept === concept);
  if (matches.length === 0) {
    return null;
  }
  // Sort by filing date descending, take the first (most recent)
  matches.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  return matches[0]!.value;
}

/**
 * Normalizes quarterly YTD values to standalone quarterly values.
 *
 * Q1: standalone (no subtraction needed)
 * Q2: Q2-only = Q2 YTD - Q1 YTD
 * Q3: Q3-only = Q3 YTD - Q2 YTD
 * Q4: Q4-only = FY - Q3 YTD
 *
 * Returns a map keyed by "fy|period" (e.g., "2025|FY", "2026|Q3")
 * with standalone (non-YTD) values per concept.
 */
export function normalizeQuarterlyYTD(
  groups: Map<string, NormalizedFact[]>,
): Map<string, Map<string, number | null>> {
  const result = new Map<string, Map<string, number | null>>();

  // First pass: collect all FY and Q values per fiscal year
  const fyData = new Map<number, Map<string, number | null>>();
  const qData = new Map<number, Map<"Q1" | "Q2" | "Q3", Map<string, number | null>>>();

  for (const [key, group] of groups) {
    const [fyStr, fp] = key.split("|") as [string, "FY" | "Q1" | "Q2" | "Q3"];
    const fy = parseInt(fyStr, 10);

    if (fp === "FY") {
      if (!fyData.has(fy)) {
        fyData.set(fy, new Map());
      }
      const fyMap = fyData.get(fy)!;
      for (const concept of KEY_CONCEPTS) {
        const val = getFactByConcept(group, concept);
        if (val !== null) {
          fyMap.set(concept, val);
        }
      }
    } else if (["Q1", "Q2", "Q3"].includes(fp)) {
      if (!qData.has(fy)) {
        qData.set(fy, new Map());
      }
      const qMap = qData.get(fy)!;
      if (!qMap.has(fp as "Q1" | "Q2" | "Q3")) {
        qMap.set(fp as "Q1" | "Q2" | "Q3", new Map());
      }
      const periodMap = qMap.get(fp as "Q1" | "Q2" | "Q3")!;
      for (const concept of KEY_CONCEPTS) {
        const val = getFactByConcept(group, concept);
        if (val !== null) {
          periodMap.set(concept, val);
        }
      }
    }
  }

  // Second pass: normalize YTD to standalone quarters
  const fyKeys = Array.from(fyData.keys()).sort((a, b) => a - b);
  for (const fy of fyKeys) {
    const fyMap = fyData.get(fy)!;

    // FY entry
    const fyResult = new Map<string, number | null>();
    for (const concept of KEY_CONCEPTS) {
      fyResult.set(concept, fyMap.get(concept) ?? null);
    }
    result.set(`${fy}|FY`, fyResult);

    const qMap = qData.get(fy);
    if (!qMap) continue;

    const q1 = qMap.get("Q1") ?? new Map();
    const q2 = qMap.get("Q2") ?? new Map();
    const q3 = qMap.get("Q3") ?? new Map();

    // Q1 is standalone
    const q1Result = new Map<string, number | null>();
    for (const concept of KEY_CONCEPTS) {
      q1Result.set(concept, q1.get(concept) ?? null);
    }
    result.set(`${fy}|Q1`, q1Result);

    // Q2-only = Q2 YTD - Q1 YTD
    const q2Result = new Map<string, number | null>();
    for (const concept of KEY_CONCEPTS) {
      const q2Val = q2.get(concept);
      const q1Val = q1.get(concept);
      q2Result.set(concept, q2Val !== null && q1Val !== null ? q2Val - q1Val : null);
    }
    result.set(`${fy}|Q2`, q2Result);

    // Q3-only = Q3 YTD - Q2 YTD
    const q3Result = new Map<string, number | null>();
    for (const concept of KEY_CONCEPTS) {
      const q3Val = q3.get(concept);
      const q2Val = q2.get(concept);
      q3Result.set(concept, q3Val !== null && q2Val !== null ? q3Val - q2Val : null);
    }
    result.set(`${fy}|Q3`, q3Result);

    // Q4-only = FY - Q3 YTD
    if (fyMap.size > 0 && q3.size > 0) {
      const q4Result = new Map<string, number | null>();
      for (const concept of KEY_CONCEPTS) {
        const fyVal = fyMap.get(concept) ?? null;
        const q3Val = q3.get(concept) ?? null;
        q4Result.set(concept, fyVal !== null && q3Val !== null ? fyVal - q3Val : null);
      }
      result.set(`${fy}|Q4`, q4Result);
    }
  }

  return result;
}

/**
 * Gets a concept value from normalized data.
 */
function getConceptValue(
  data: Map<string, number | null> | undefined,
  concept: string,
): number | null {
  return data?.get(concept) ?? null;
}

/**
 * Calculates financial ratios from normalized data.
 * Missing values are treated as null (unknown), not zero.
 */
export function calculateRatios(normalized: Map<string, Map<string, number | null>>): RatioResult[] {
  const results: RatioResult[] = [];

  for (const [key, data] of normalized) {
    const [fyStr, period] = key.split("|") as [string, "FY" | "Q1" | "Q2" | "Q3" | "Q4"];
    const fy = parseInt(fyStr, 10);

    const revenue = getConceptValue(data, "RevenueFromContractWithCustomerExcludingAssessedTax");
    const grossProfit = getConceptValue(data, "GrossProfit");
    const operatingIncome = getConceptValue(data, "OperatingIncomeLoss");
    const netIncome = getConceptValue(data, "NetIncomeLoss");
    const assets = getConceptValue(data, "Assets");
    const liabilities = getConceptValue(data, "Liabilities");
    const equity = getConceptValue(data, "StockholdersEquity");
    const assetsCurrent = getConceptValue(data, "AssetsCurrent");
    const liabilitiesCurrent = getConceptValue(data, "LiabilitiesCurrent");
    const longTermDebt = getConceptValue(data, "LongTermDebt");
    const operatingCashFlow = getConceptValue(data, "NetCashProvidedByUsedInOperatingActivities");
    const capex = getConceptValue(data, "PaymentsToAcquirePropertyPlantAndEquipment");

    // Equity fallback: Assets - Liabilities if StockholdersEquity not available
    const computedEquity =
      equity ?? (assets !== null && liabilities !== null ? assets - liabilities : null);

    // Total debt: LongTermDebt + LongTermDebtCurrent
    const longTermDebtCurrent = getConceptValue(data, "LongTermDebtCurrent");
    const totalDebt =
      longTermDebt !== null && longTermDebtCurrent !== null
        ? longTermDebt + longTermDebtCurrent
        : longTermDebt !== null
          ? longTermDebt
          : longTermDebtCurrent !== null
            ? longTermDebtCurrent
            : null;

    const result: RatioResult = {
      fy,
      period: period as "FY" | "Q1" | "Q2" | "Q3" | "Q4",
      grossMargin:
        revenue !== null && revenue !== 0 && grossProfit !== null ? grossProfit / revenue : null,
      operatingMargin:
        revenue !== null && revenue !== 0 && operatingIncome !== null
          ? operatingIncome / revenue
          : null,
      netMargin:
        revenue !== null && revenue !== 0 && netIncome !== null ? netIncome / revenue : null,
      currentRatio:
        assetsCurrent !== null && liabilitiesCurrent !== null && liabilitiesCurrent !== 0
          ? assetsCurrent / liabilitiesCurrent
          : null,
      debtToEquity:
        totalDebt !== null && computedEquity !== null && computedEquity !== 0
          ? totalDebt / computedEquity
          : null,
      freeCashFlow:
        operatingCashFlow !== null && capex !== null ? operatingCashFlow - Math.abs(capex) : null,
      returnOnAssets:
        assets !== null && assets !== 0 && netIncome !== null ? netIncome / assets : null,
      returnOnEquity:
        computedEquity !== null && computedEquity !== 0 && netIncome !== null
          ? netIncome / computedEquity
          : null,
      revenueGrowth: null, // computed below
    };

    results.push(result);
  }

  // Compute revenue growth (YoY)
  for (let i = 0; i < results.length; i++) {
    const current = results[i]!;
    const prior = results.find((r) => r.fy === current.fy - 1 && r.period === current.period);

    if (!prior) continue;

    const currentKey = `${current.fy}|${current.period}`;
    const priorKey = `${prior.fy}|${prior.period}`;
    const currentData = normalized.get(currentKey);
    const priorData = normalized.get(priorKey);

    const currentRev = getConceptValue(
      currentData,
      "RevenueFromContractWithCustomerExcludingAssessedTax",
    );
    const priorRev = getConceptValue(
      priorData,
      "RevenueFromContractWithCustomerExcludingAssessedTax",
    );

    if (currentRev !== null && priorRev !== null && priorRev !== 0) {
      current.revenueGrowth = (currentRev - priorRev) / priorRev;
    }
  }

  return results;
}

function main(): void {
  console.log("Loading and normalizing SEC company facts...\n");

  const { cik, entityName, facts } = loadAndNormalizeFacts(INPUT_PATH);
  console.log(`Entity: ${entityName} (CIK: ${cik})`);
  console.log(`Total normalized facts: ${facts.length}`);

  const groups = groupByFiscalPeriod(facts);
  console.log(`Fiscal period groups: ${groups.size}`);

  const normalized = normalizeQuarterlyYTD(groups);
  console.log(`Normalized periods: ${normalized.size}`);

  const ratios = calculateRatios(normalized);
  console.log(`Ratio calculations: ${ratios.length}`);

  // Build output
  const output = {
    cik,
    entityName,
    source: "SEC Edgar companyfacts",
    normalizedFacts: Array.from(normalized.entries()).map(([key, data]) => {
      const [fyStr, period] = key.split("|") as [string, string];
      return {
        fy: parseInt(fyStr, 10),
        period,
        concepts: Object.fromEntries(Array.from(data.entries()).map(([k, v]) => [k, v])),
      };
    }),
    ratios,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`\nOutput written to: ${OUTPUT_PATH}`);

  // Print summary of latest FY ratios
  const latestFyRatios = ratios
    .filter((r) => r.period === "FY")
    .sort((a, b) => b.fy - a.fy)
    .slice(0, 5);

  console.log("\n--- Latest FY Ratios ---");
  for (const r of latestFyRatios) {
    const data = normalized.get(`${r.fy}|FY`);
    const revenue = getConceptValue(data, "RevenueFromContractWithCustomerExcludingAssessedTax");
    console.log(`\nFY ${r.fy}:`);
    console.log(`  Revenue: ${revenue !== null ? revenue.toLocaleString() : "N/A"}`);
    console.log(
      `  Gross Margin: ${r.grossMargin !== null ? (r.grossMargin * 100).toFixed(2) + "%" : "N/A"}`,
    );
    console.log(
      `  Operating Margin: ${r.operatingMargin !== null ? (r.operatingMargin * 100).toFixed(2) + "%" : "N/A"}`,
    );
    console.log(
      `  Net Margin: ${r.netMargin !== null ? (r.netMargin * 100).toFixed(2) + "%" : "N/A"}`,
    );
    console.log(`  Current Ratio: ${r.currentRatio !== null ? r.currentRatio.toFixed(2) : "N/A"}`);
    console.log(`  Debt-to-Equity: ${r.debtToEquity !== null ? r.debtToEquity.toFixed(2) : "N/A"}`);
    console.log(
      `  Free Cash Flow: ${r.freeCashFlow !== null ? r.freeCashFlow.toLocaleString() : "N/A"}`,
    );
    console.log(
      `  ROA: ${r.returnOnAssets !== null ? (r.returnOnAssets * 100).toFixed(2) + "%" : "N/A"}`,
    );
    console.log(
      `  ROE: ${r.returnOnEquity !== null ? (r.returnOnEquity * 100).toFixed(2) + "%" : "N/A"}`,
    );
    console.log(
      `  Revenue Growth: ${r.revenueGrowth !== null ? (r.revenueGrowth * 100).toFixed(2) + "%" : "N/A"}`,
    );
  }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("fundamentalsCollector.ts")) {
  main();
}
