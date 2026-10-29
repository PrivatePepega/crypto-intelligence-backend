import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  OUTPUT_DIR,
  SEC_DATA_BASE,
  SEC_WWW_BASE,
  getFilingDocumentUrl,
  getRawFilingDocumentUrl,
  padCik,
  parseRecentFilings,
  rateLimitedFetch,
  saveJson,
  type SecFiling,
} from "./secEdgarFetch.js";
import {
  child,
  childBoolean,
  childText,
  childrenNamed,
  collectFootnoteIds,
  parseOptionalNumber,
  parseXml,
  textOf,
  valueOf,
  type XmlNode,
} from "./secXml.js";

/**
 * SEC Edgar insider-ownership collector (Forms 3, 4 and 5).
 *
 * Discovers filings through the submissions endpoint, fetches each raw
 * ownership XML document, and normalizes the ownership tables into
 * transaction rows. The output keeps the filing URL, filing date, accession
 * number, direct/indirect ownership and the transaction code so downstream
 * code can distinguish purchases, sales, awards and other events.
 *
 * Output: collectors/assets/stocks/data/Edgar insider_CIK{cik}.json
 *
 * Run with:
 *   npx tsx collectors/assets/secInsiderOwnership.ts --cik=320193 --max=12
 *
 * Rate limiting is inherited from secEdgarFetch (1 request/second, SEC
 * User-Agent, exponential backoff on 429).
 */

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

export interface InsiderOwner {
  cik: string | null;
  name: string;
  relationship: InsiderRelationship;
}

export interface InsiderIssuer {
  cik: string | null;
  name: string | null;
  tradingSymbol: string | null;
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

export interface InsiderOwnershipFiling {
  form: string;
  documentType: string;
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  periodOfReport: string;
  documentUrl: string;
  xmlUrl: string;
  issuer: InsiderIssuer;
  reportingOwners: InsiderOwner[];
  reportingOwner: InsiderOwner | null;
  aff10b5One: boolean | null;
  noSecuritiesOwned: boolean | null;
  notSubjectToSection16: boolean | null;
  form3HoldingsReported: boolean | null;
  form4TransactionsReported: boolean | null;
  footnotes: Record<string, string>;
  transactions: InsiderTransaction[];
}

export interface InsiderOwnershipSummary {
  filings: number;
  forms: Record<string, number>;
  transactions: number;
  holdings: number;
  purchases: number;
  sales: number;
  awards: number;
  other: number;
  purchaseShares: number;
  saleShares: number;
  purchaseValue: number;
  saleValue: number;
}

export interface InsiderOwnershipReport {
  source: "SEC EDGAR Forms 3/4/5";
  cik: string;
  entityName: string;
  generatedAt: string;
  requestedForms: string[];
  filings: InsiderOwnershipFiling[];
  transactions: InsiderTransaction[];
  summary: InsiderOwnershipSummary;
  errors: Array<{ accessionNumber: string; form: string; message: string }>;
}

export interface OwnershipFilingMeta {
  form: string;
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  documentUrl: string;
  xmlUrl: string;
}

const TRANSACTION_TYPES: Record<string, InsiderTransactionType> = {
  P: "purchase",
  S: "sale",
  A: "award",
  M: "optionExercise",
  C: "conversion",
  F: "taxWithholding",
  D: "dispositionToIssuer",
  G: "gift",
};

const ACQUISITION_CODES = new Set(["P", "A", "M", "C", "J", "W"]);
const DISPOSITION_CODES = new Set(["S", "F", "D", "G"]);

/** Maps an SEC transaction code to a stable, human-readable category. */
export function classifyInsiderTransaction(
  code: string | null,
  isHolding: boolean,
): InsiderTransactionType {
  if (isHolding) {
    return "holding";
  }
  if (!code) {
    return "other";
  }
  return TRANSACTION_TYPES[code.trim().toUpperCase()] ?? "other";
}

function classifyCategory(
  code: string | null,
  acquiredDisposedCode: "A" | "D" | null,
): InsiderTransactionCategory {
  if (acquiredDisposedCode === "A") {
    return "acquisition";
  }
  if (acquiredDisposedCode === "D") {
    return "disposition";
  }
  if (!code) {
    return null;
  }
  const upper = code.trim().toUpperCase();
  if (ACQUISITION_CODES.has(upper)) {
    return "acquisition";
  }
  if (DISPOSITION_CODES.has(upper)) {
    return "disposition";
  }
  return null;
}

function normalizeAcquiredDisposed(value: string | null): "A" | "D" | null {
  const upper = value?.trim().toUpperCase();
  return upper === "A" || upper === "D" ? upper : null;
}

function normalizeDirectOrIndirect(value: string | null): "D" | "I" | null {
  const upper = value?.trim().toUpperCase();
  return upper === "D" || upper === "I" ? upper : null;
}

function parseOwner(node: XmlNode): InsiderOwner {
  const id = child(node, "reportingOwnerId");
  const relationship = child(node, "reportingOwnerRelationship");

  return {
    cik: childText(id, "rptOwnerCik"),
    name: childText(id, "rptOwnerName") ?? "",
    relationship: {
      isDirector: childBoolean(relationship, "isDirector"),
      isOfficer: childBoolean(relationship, "isOfficer"),
      isTenPercentOwner: childBoolean(relationship, "isTenPercentOwner"),
      isOther: childBoolean(relationship, "isOther"),
      officerTitle: childText(relationship, "officerTitle"),
    },
  };
}

function parseFootnotes(root: XmlNode): Record<string, string> {
  const footnotes: Record<string, string> = {};
  for (const footnote of childrenNamed(child(root, "footnotes"), "footnote")) {
    const id = footnote.attrs["id"];
    if (id) {
      footnotes[id] = textOf(footnote);
    }
  }
  return footnotes;
}

function resolveFootnoteTexts(node: XmlNode, footnotes: Record<string, string>): string[] {
  return collectFootnoteIds(node)
    .map((id) => footnotes[id])
    .filter((text): text is string => text !== undefined);
}

function parseTransactionNode(
  node: XmlNode,
  context: {
    meta: OwnershipFilingMeta;
    issuer: InsiderIssuer;
    owner: InsiderOwner | null;
    footnotes: Record<string, string>;
  },
  table: "nonDerivative" | "derivative",
  isHolding: boolean,
  lineNumber: number,
): InsiderTransaction {
  const coding = child(node, "transactionCoding");
  const amounts = child(node, "transactionAmounts");
  const postAmounts = child(node, "postTransactionAmounts");
  const ownershipNature = child(node, "ownershipNature");
  const underlying = child(node, "underlyingSecurity");

  const transactionShares = parseOptionalNumber(valueOf(child(amounts, "transactionShares")));
  const pricePerShare = parseOptionalNumber(valueOf(child(amounts, "transactionPricePerShare")));
  const acquiredDisposedCode = normalizeAcquiredDisposed(
    valueOf(child(amounts, "transactionAcquiredDisposedCode")),
  );
  const transactionCode = childText(coding, "transactionCode");
  const directOrIndirectOwnership = normalizeDirectOrIndirect(
    valueOf(child(ownershipNature, "directOrIndirectOwnership")),
  );

  const sharesOwnedFollowingTransaction =
    parseOptionalNumber(valueOf(child(postAmounts, "sharesOwnedFollowingTransaction"))) ??
    (isHolding && table === "nonDerivative" ? transactionShares : null);
  // Holding rows have no transaction amounts; their reported position is the
  // number of shares owned following the (non-)transaction.
  const shares =
    transactionShares ??
    (isHolding && table === "nonDerivative" ? sharesOwnedFollowingTransaction : null);

  return {
    form: context.meta.form,
    accessionNumber: context.meta.accessionNumber,
    filingDate: context.meta.filingDate,
    reportDate: context.meta.reportDate,
    documentUrl: context.meta.documentUrl,
    xmlUrl: context.meta.xmlUrl,
    issuerCik: context.issuer.cik,
    issuerName: context.issuer.name,
    issuerTradingSymbol: context.issuer.tradingSymbol,
    insiderCik: context.owner?.cik ?? null,
    insiderName: context.owner?.name ?? null,
    relationship: context.owner?.relationship ?? {
      isDirector: null,
      isOfficer: null,
      isTenPercentOwner: null,
      isOther: null,
      officerTitle: null,
    },
    table,
    isHolding,
    lineNumber,
    securityTitle: valueOf(child(node, "securityTitle")),
    transactionDate: valueOf(child(node, "transactionDate")),
    transactionCode,
    transactionFormType: childText(coding, "transactionFormType"),
    transactionType: classifyInsiderTransaction(transactionCode, isHolding),
    transactionCategory: isHolding ? null : classifyCategory(transactionCode, acquiredDisposedCode),
    isOpenMarket:
      transactionCode?.trim().toUpperCase() === "P" ||
      transactionCode?.trim().toUpperCase() === "S",
    equitySwapInvolved: childBoolean(coding, "equitySwapInvolved"),
    acquiredDisposedCode,
    shares,
    pricePerShare,
    transactionValue:
      shares !== null && pricePerShare !== null
        ? Math.round(shares * pricePerShare * 100) / 100
        : null,
    sharesOwnedFollowingTransaction,
    directOrIndirectOwnership,
    natureOfOwnership: valueOf(child(ownershipNature, "natureOfOwnership")),
    underlyingSecurityTitle: valueOf(child(underlying, "underlyingSecurityTitle")),
    underlyingSecurityShares: parseOptionalNumber(
      valueOf(child(underlying, "underlyingSecurityShares")),
    ),
    conversionOrExercisePrice: parseOptionalNumber(
      valueOf(child(node, "conversionOrExercisePrice")),
    ),
    exerciseDate: valueOf(child(node, "exerciseDate")),
    expirationDate: valueOf(child(node, "expirationDate")),
    footnotes: resolveFootnoteTexts(node, context.footnotes),
  };
}

/**
 * Parses a raw SEC ownership document (Forms 3, 4 and 5) into normalized
 * filing and transaction records.
 */
export function parseOwnershipDocument(
  xml: string,
  meta: OwnershipFilingMeta,
): InsiderOwnershipFiling {
  const root = parseXml(xml);
  if (root.name !== "ownershipDocument") {
    throw new Error(`Unexpected ownership XML root element: ${root.name}`);
  }

  const issuerNode = child(root, "issuer");
  const issuer: InsiderIssuer = {
    cik: childText(issuerNode, "issuerCik"),
    name: childText(issuerNode, "issuerName"),
    tradingSymbol: childText(issuerNode, "issuerTradingSymbol"),
  };

  const reportingOwners = childrenNamed(root, "reportingOwner").map(parseOwner);
  const primaryOwner = reportingOwners[0] ?? null;
  const footnotes = parseFootnotes(root);
  const periodOfReport = childText(root, "periodOfReport") ?? meta.reportDate;
  const context = { meta, issuer, owner: primaryOwner, footnotes };

  const transactions: InsiderTransaction[] = [];

  const nonDerivativeTable = child(root, "nonDerivativeTable");
  let lineNumber = 0;
  for (const node of childrenNamed(nonDerivativeTable, "nonDerivativeTransaction")) {
    transactions.push(parseTransactionNode(node, context, "nonDerivative", false, ++lineNumber));
  }
  for (const node of childrenNamed(nonDerivativeTable, "nonDerivativeHolding")) {
    transactions.push(parseTransactionNode(node, context, "nonDerivative", true, ++lineNumber));
  }

  const derivativeTable = child(root, "derivativeTable");
  lineNumber = 0;
  for (const node of childrenNamed(derivativeTable, "derivativeTransaction")) {
    transactions.push(parseTransactionNode(node, context, "derivative", false, ++lineNumber));
  }
  for (const node of childrenNamed(derivativeTable, "derivativeHolding")) {
    transactions.push(parseTransactionNode(node, context, "derivative", true, ++lineNumber));
  }

  return {
    form: meta.form,
    documentType: childText(root, "documentType") ?? meta.form,
    accessionNumber: meta.accessionNumber,
    filingDate: meta.filingDate,
    reportDate: meta.reportDate,
    periodOfReport,
    documentUrl: meta.documentUrl,
    xmlUrl: meta.xmlUrl,
    issuer,
    reportingOwners,
    reportingOwner: primaryOwner,
    aff10b5One: childBoolean(root, "aff10b5One"),
    noSecuritiesOwned: childBoolean(root, "noSecuritiesOwned"),
    notSubjectToSection16: childBoolean(root, "notSubjectToSection16"),
    form3HoldingsReported: childBoolean(root, "form3HoldingsReported"),
    form4TransactionsReported: childBoolean(root, "form4TransactionsReported"),
    footnotes,
    transactions,
  };
}

function sumNullable(values: Array<number | null>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function buildSummary(filings: InsiderOwnershipFiling[]): InsiderOwnershipSummary {
  const transactions = filings.flatMap((filing) => filing.transactions);
  const forms: Record<string, number> = {};
  for (const filing of filings) {
    forms[filing.form] = (forms[filing.form] ?? 0) + 1;
  }

  const purchases = transactions.filter((tx) => tx.transactionType === "purchase");
  const sales = transactions.filter((tx) => tx.transactionType === "sale");
  const awards = transactions.filter((tx) => tx.transactionType === "award");

  return {
    filings: filings.length,
    forms,
    transactions: transactions.length,
    holdings: transactions.filter((tx) => tx.isHolding).length,
    purchases: purchases.length,
    sales: sales.length,
    awards: awards.length,
    other:
      transactions.length -
      purchases.length -
      sales.length -
      awards.length -
      transactions.filter((tx) => tx.isHolding).length,
    purchaseShares: sumNullable(purchases.map((tx) => tx.shares)),
    saleShares: sumNullable(sales.map((tx) => tx.shares)),
    purchaseValue: sumNullable(purchases.map((tx) => tx.transactionValue)),
    saleValue: sumNullable(sales.map((tx) => tx.transactionValue)),
  };
}

async function fetchText(
  url: string,
  accept: string,
): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await rateLimitedFetch(url, { headers: { Accept: accept } });
  if (!response.ok) {
    return { ok: false, status: response.status, text: "" };
  }
  return { ok: true, status: response.status, text: await response.text() };
}

async function fetchIndexFiles(cik: string, accessionNumber: string): Promise<string[]> {
  const cikWithoutZeros = String(cik).replace(/^0+/, "");
  const accessionNoDashes = accessionNumber.replace(/-/g, "");
  const url = `${SEC_WWW_BASE}/Archives/edgar/data/${cikWithoutZeros}/${accessionNoDashes}/index.json`;

  const response = await rateLimitedFetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    directory?: { item?: Array<{ name?: unknown }> };
  };

  return (payload.directory?.item ?? [])
    .map((item) => (typeof item.name === "string" ? item.name : ""))
    .filter((name) => name !== "");
}

function scoreXmlCandidate(name: string): number {
  const lower = name.toLowerCase();
  if (/^form[345]\.xml$/.test(lower)) {
    return 0;
  }
  if (lower.includes("form3") || lower.includes("form4") || lower.includes("form5")) {
    return 1;
  }
  if (lower.startsWith("wk-form")) {
    return 2;
  }
  return 3;
}

/**
 * Fetches the raw ownership XML, falling back to the filing index when the
 * `primaryDocument` path is a rendered XSL view or otherwise unavailable.
 */
async function resolveOwnershipXml(
  cik: string,
  filing: SecFiling,
): Promise<{ xmlUrl: string; xml: string } | null> {
  const preferredUrl = getRawFilingDocumentUrl(cik, filing.accessionNumber, filing.primaryDocument);

  const direct = await fetchText(preferredUrl, "application/xml");
  if (direct.ok && direct.text.includes("<ownershipDocument")) {
    return { xmlUrl: preferredUrl, xml: direct.text };
  }

  const files = await fetchIndexFiles(cik, filing.accessionNumber);
  const candidates = files
    .filter((name) => name.toLowerCase().endsWith(".xml"))
    .filter((name) => !name.toLowerCase().includes("primary_doc"))
    .sort((a, b) => scoreXmlCandidate(a) - scoreXmlCandidate(b));

  for (const candidate of candidates) {
    const url = getFilingDocumentUrl(cik, filing.accessionNumber, candidate);
    const result = await fetchText(url, "application/xml");
    if (result.ok && result.text.includes("<ownershipDocument")) {
      return { xmlUrl: url, xml: result.text };
    }
  }

  return null;
}

async function loadSubmissions(cik: string, refresh: boolean): Promise<Record<string, unknown>> {
  const filename = `Edgar submissions_CIK${cik}.json`;
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!refresh) {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf-8")) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  const url = `${SEC_DATA_BASE}/submissions/CIK${padCik(cik)}.json`;
  const response = await rateLimitedFetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`SEC submissions request failed: ${response.status} for ${url}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  await saveJson(filename, data);
  return data;
}

function sortFilingsNewestFirst(filings: SecFiling[]): SecFiling[] {
  return [...filings].sort((a, b) => {
    if (a.filingDate !== b.filingDate) {
      return b.filingDate.localeCompare(a.filingDate);
    }
    return b.accessionNumber.localeCompare(a.accessionNumber);
  });
}

export interface CollectInsiderOwnershipOptions {
  cik: string | number;
  forms?: string[];
  maxFilings?: number;
  includeAmendments?: boolean;
  refreshSubmissions?: boolean;
  outputFilename?: string;
}

/**
 * Collects Forms 3/4/5 for a company and writes a normalized JSON report.
 * Only `filings.recent` is used; older submissions archives are not fetched.
 */
export async function collectInsiderOwnership(
  options: CollectInsiderOwnershipOptions,
): Promise<InsiderOwnershipReport> {
  const cik = String(options.cik);
  const requestedForms = options.forms?.length ? options.forms : ["3", "4", "5"];
  const maxFilings = Math.max(1, options.maxFilings ?? 20);

  const submissions = await loadSubmissions(cik, options.refreshSubmissions ?? false);
  const allFilings = parseRecentFilings(submissions, cik);

  const acceptedForms = new Set(requestedForms);
  if (options.includeAmendments) {
    for (const form of requestedForms) {
      acceptedForms.add(`${form}/A`);
    }
  }

  const candidates = sortFilingsNewestFirst(
    allFilings.filter((filing) => acceptedForms.has(filing.form)),
  ).slice(0, maxFilings);

  const filings: InsiderOwnershipFiling[] = [];
  const errors: InsiderOwnershipReport["errors"] = [];

  console.log(
    `Collecting ${candidates.length} insider filing(s) for CIK ${cik} ` +
      `(forms: ${[...acceptedForms].join(", ")})...`,
  );

  for (const filing of candidates) {
    try {
      const resolved = await resolveOwnershipXml(cik, filing);
      if (!resolved) {
        errors.push({
          accessionNumber: filing.accessionNumber,
          form: filing.form,
          message: "Ownership XML document not found in filing directory.",
        });
        console.warn(`  ! ${filing.form} ${filing.accessionNumber}: XML not found`);
        continue;
      }

      const parsed = parseOwnershipDocument(resolved.xml, {
        form: filing.form,
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate,
        reportDate: filing.reportDate,
        documentUrl: getFilingDocumentUrl(cik, filing.accessionNumber, filing.primaryDocument),
        xmlUrl: resolved.xmlUrl,
      });

      filings.push(parsed);
      console.log(
        `  ✓ ${filing.form} ${filing.filingDate} ${filing.accessionNumber} ` +
          `(${parsed.transactions.length} row(s))`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        accessionNumber: filing.accessionNumber,
        form: filing.form,
        message,
      });
      console.warn(`  ! ${filing.form} ${filing.accessionNumber}: ${message}`);
    }
  }

  const transactions = filings
    .flatMap((filing) => filing.transactions)
    .sort((a, b) => {
      if (a.filingDate !== b.filingDate) {
        return b.filingDate.localeCompare(a.filingDate);
      }
      const aDate = a.transactionDate ?? "";
      const bDate = b.transactionDate ?? "";
      if (aDate !== bDate) {
        return bDate.localeCompare(aDate);
      }
      return a.lineNumber - b.lineNumber;
    });

  const report: InsiderOwnershipReport = {
    source: "SEC EDGAR Forms 3/4/5",
    cik,
    entityName: typeof submissions["name"] === "string" ? submissions["name"] : "",
    generatedAt: new Date().toISOString(),
    requestedForms: [...acceptedForms],
    filings,
    transactions,
    summary: buildSummary(filings),
    errors,
  };

  const outputFilename = options.outputFilename ?? `Edgar insider_CIK${cik}.json`;
  await saveJson(outputFilename, report);
  return report;
}

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const cik = getArg("cik") ?? "320193";
  const maxFilings = Number.parseInt(getArg("max") ?? "12", 10);
  const forms = (getArg("forms") ?? "3,4,5")
    .split(",")
    .map((form) => form.trim())
    .filter((form) => form !== "");
  const includeAmendments = getArg("amendments") === "true";

  const outputFilename = getArg("output");
  const report = await collectInsiderOwnership({
    cik,
    maxFilings: Number.isFinite(maxFilings) ? maxFilings : 12,
    forms,
    includeAmendments,
    refreshSubmissions: getArg("refresh") === "true",
    ...(outputFilename ? { outputFilename } : {}),
  });

  console.log("\nInsider ownership summary:");
  console.log(`  Entity:        ${report.entityName}`);
  console.log(`  Filings:       ${report.summary.filings}`);
  console.log(`  Transactions:  ${report.summary.transactions}`);
  console.log(`  Purchases:     ${report.summary.purchases}`);
  console.log(`  Sales:         ${report.summary.sales}`);
  console.log(`  Awards:        ${report.summary.awards}`);
  console.log(`  Holdings:      ${report.summary.holdings}`);
  if (report.errors.length > 0) {
    console.log(`  Errors:        ${report.errors.length}`);
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
