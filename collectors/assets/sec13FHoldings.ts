import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

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
  toIsoDate,
  type SecFiling,
} from "./secEdgarFetch.js";
import {
  child,
  childBoolean,
  childText,
  childrenNamed,
  parseOptionalNumber,
  parseXml,
  textOf,
  valueOf,
  type XmlNode,
} from "./secXml.js";

/**
 * SEC Edgar institutional-holdings collector (Forms 13F-HR and 13F-HR/A).
 *
 * Two ingestion paths are supported:
 *
 * 1. Manager path — discover a manager's filings through the submissions
 *    endpoint, fetch the cover page and information table, and normalize the
 *    reported positions for the latest report periods.
 *
 * 2. Bulk path — download/process the SEC's quarterly Form 13F data set and
 *    extract every manager reporting a target CUSIP.
 *
 * Both paths apply amendments deterministically:
 *   - RESTATEMENT replaces the period's holdings.
 *   - NEW HOLDINGS appends the newly disclosed positions.
 *
 * 13F values are stored as reported and also normalized to USD. Filings on or
 * after 2023-01-03 report dollars; earlier filings report thousands.
 *
 * Run with:
 *   npx tsx collectors/assets/sec13FHoldings.ts --cik=1067983 --max-periods=4
 *   npx tsx collectors/assets/sec13FHoldings.ts --year=2013 --quarter=2 \
 *     --cusip=037833100 --asset=AAPL
 *
 * Rate limiting is inherited from secEdgarFetch (1 request/second, SEC
 * User-Agent, exponential backoff on 429).
 */

export type ThirteenFValueUnit = "USD" | "USD_THOUSANDS";
export type ThirteenFAmendmentType = "RESTATEMENT" | "NEW HOLDINGS" | "OTHER" | null;

export interface ThirteenFAddress {
  street1: string | null;
  street2: string | null;
  city: string | null;
  stateOrCountry: string | null;
  zipCode: string | null;
}

export interface ThirteenFCoverPage {
  submissionType: string | null;
  periodOfReport: string | null;
  reportCalendarOrQuarter: string | null;
  isAmendment: boolean;
  amendmentNo: number | null;
  amendmentType: ThirteenFAmendmentType;
  amendmentTypeRaw: string | null;
  filingManagerName: string | null;
  filingManagerAddress: ThirteenFAddress;
  reportType: string | null;
  form13FFileNumber: string | null;
  summary: {
    otherIncludedManagersCount: number | null;
    tableEntryTotal: number | null;
    tableValueTotal: number | null;
    isConfidentialOmitted: boolean | null;
  };
  signature: {
    name: string | null;
    title: string | null;
    phone: string | null;
    signature: string | null;
    city: string | null;
    stateOrCountry: string | null;
    signatureDate: string | null;
  };
}

export interface ThirteenFVotingAuthority {
  sole: number | null;
  shared: number | null;
  none: number | null;
}

export interface ThirteenFInfoEntry {
  /** INFOTABLE_SK for bulk data set rows; null for XML rows. */
  sourceRowId: string | null;
  nameOfIssuer: string;
  titleOfClass: string;
  cusip: string;
  figi: string | null;
  valueAsReported: number | null;
  shares: number | null;
  shareType: string | null;
  putCall: string | null;
  investmentDiscretion: string | null;
  otherManager: string | null;
  votingAuthority: ThirteenFVotingAuthority;
}

export interface CusipMapping {
  assetId: string;
  ticker: string | null;
  name: string | null;
}

export type CusipMap = Record<string, CusipMapping>;

export interface CusipResolution {
  status: "mapped" | "unmapped";
  assetId: string | null;
  ticker: string | null;
  name: string | null;
}

export interface ThirteenFFilingInput {
  form: string;
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  isAmendment: boolean;
  amendmentType: ThirteenFAmendmentType;
  entries: ThirteenFInfoEntry[];
  coverPage: ThirteenFCoverPage | null;
  primaryDocumentUrl: string | null;
  informationTableUrl: string | null;
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
  /** The unit is derived from the SEC filing-date rule, not read from the filing. */
  valueUnitSource: "sec_filing_date_rule";
  valueUnitMixed: boolean;
  valueUsd: number | null;
  /** valueUsd / shares, useful for auditing as-filed unit anomalies. */
  impliedPricePerShare: number | null;
  investmentDiscretions: string[];
  otherManagers: string[];
  votingAuthority: ThirteenFVotingAuthority;
  entryCount: number;
  filingDate: string;
  reportPeriod: string;
  accessionNumber: string;
  form: string;
  amendmentType: ThirteenFAmendmentType;
  filingRefs: Array<{
    accessionNumber: string;
    filingDate: string;
    form: string;
    amendmentType: ThirteenFAmendmentType;
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
    amendmentType: ThirteenFAmendmentType;
    informationTableUrl: string | null;
  }>;
  totals: {
    positions: number;
    valueUsd: number;
    sharesByType: Record<string, number>;
  };
}

export interface ThirteenFManagerReport {
  source: "SEC EDGAR Form 13F";
  cik: string;
  managerName: string;
  generatedAt: string;
  periods: ThirteenFPeriod[];
  errors: Array<{ accessionNumber: string; form: string; message: string }>;
}

export interface ThirteenFBulkManager {
  cik: string;
  managerName: string;
  periods: ThirteenFPeriod[];
}

export interface ThirteenFBulkReport {
  source: "SEC EDGAR Form 13F bulk data set";
  dataset: {
    year: number | null;
    quarter: number | null;
    url: string | null;
    zipPath: string | null;
    generatedAt: string;
  };
  target: {
    cusips: string[];
    assetId: string | null;
    unmatchedCusips: string[];
  };
  managers: ThirteenFBulkManager[];
  totals: {
    managers: number;
    positions: number;
    valueUsd: number;
    sharesByType: Record<string, number>;
  };
  errors: string[];
}

const DOLLAR_VALUE_EFFECTIVE_DATE = "2023-01-03";

// Re-exported so existing callers and tests keep a single import site.
export { toIsoDate };

function localName(name: string): string {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

function childLocal(node: XmlNode | null | undefined, name: string): XmlNode | null {
  if (!node) {
    return null;
  }
  return node.children.find((candidate) => localName(candidate.name) === name) ?? null;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Normalizes a reported 13F value to dollars.
 *
 * The SEC changed Form 13F value reporting on 2023-01-03: from that date
 * values are reported in dollars; before that they were reported in thousands.
 */
export function normalize13FValue(
  valueAsReported: number | null,
  filingDate: string | null,
): {
  valueAsReported: number | null;
  valueUnit: ThirteenFValueUnit | null;
  valueUsd: number | null;
} {
  if (valueAsReported === null) {
    return { valueAsReported: null, valueUnit: null, valueUsd: null };
  }

  if (filingDate === null) {
    return { valueAsReported, valueUnit: null, valueUsd: null };
  }

  const valueUnit: ThirteenFValueUnit =
    filingDate >= DOLLAR_VALUE_EFFECTIVE_DATE ? "USD" : "USD_THOUSANDS";

  return {
    valueAsReported,
    valueUnit,
    valueUsd: Math.round(valueAsReported * (valueUnit === "USD" ? 1 : 1000)),
  };
}

function normalizeAmendmentType(value: string | null): ThirteenFAmendmentType {
  const upper = value?.trim().toUpperCase();
  if (upper === "RESTATEMENT") {
    return "RESTATEMENT";
  }
  if (upper === "NEW HOLDINGS") {
    return "NEW HOLDINGS";
  }
  return upper ? "OTHER" : null;
}

function parseAddress(node: XmlNode | null): ThirteenFAddress {
  return {
    street1: childText(childLocal(node, "street1"), "value") ?? textOf(childLocal(node, "street1")),
    street2: childText(childLocal(node, "street2"), "value") ?? textOf(childLocal(node, "street2")),
    city: childLocal(node, "city") ? textOf(childLocal(node, "city")) : null,
    stateOrCountry: childLocal(node, "stateOrCountry")
      ? textOf(childLocal(node, "stateOrCountry"))
      : null,
    zipCode: childLocal(node, "zipCode") ? textOf(childLocal(node, "zipCode")) : null,
  };
}

/**
 * Parses the 13F cover page XML (`primary_doc.xml`).
 */
export function parse13FCoverPage(xml: string): ThirteenFCoverPage {
  const root = parseXml(xml);
  const headerData = childLocal(root, "headerData");
  const filerInfo = childLocal(headerData, "filerInfo");
  const formData = childLocal(root, "formData");
  const coverPage = childLocal(formData, "coverPage");
  const amendmentInfo = childLocal(coverPage, "amendmentInfo");
  const filingManager = childLocal(coverPage, "filingManager");
  const summaryPage = childLocal(formData, "summaryPage");
  const signatureBlock = childLocal(formData, "signatureBlock");

  const amendmentTypeRaw = childText(amendmentInfo, "amendmentType");

  return {
    submissionType: childText(headerData, "submissionType"),
    periodOfReport: toIsoDate(childText(filerInfo, "periodOfReport")),
    reportCalendarOrQuarter: toIsoDate(childText(coverPage, "reportCalendarOrQuarter")),
    isAmendment: childBoolean(coverPage, "isAmendment") ?? false,
    amendmentNo: parseOptionalNumber(childText(coverPage, "amendmentNo")),
    amendmentType: normalizeAmendmentType(amendmentTypeRaw),
    amendmentTypeRaw,
    filingManagerName: childText(filingManager, "name"),
    filingManagerAddress: parseAddress(childLocal(filingManager, "address")),
    reportType: childText(coverPage, "reportType"),
    form13FFileNumber: childText(coverPage, "form13FFileNumber"),
    summary: {
      otherIncludedManagersCount: parseOptionalNumber(
        childText(summaryPage, "otherIncludedManagersCount"),
      ),
      tableEntryTotal: parseOptionalNumber(childText(summaryPage, "tableEntryTotal")),
      tableValueTotal: parseOptionalNumber(childText(summaryPage, "tableValueTotal")),
      isConfidentialOmitted: childBoolean(summaryPage, "isConfidentialOmitted"),
    },
    signature: {
      name: childText(signatureBlock, "name"),
      title: childText(signatureBlock, "title"),
      phone: childText(signatureBlock, "phone"),
      signature: childText(signatureBlock, "signature"),
      city: childText(signatureBlock, "city"),
      stateOrCountry: childText(signatureBlock, "stateOrCountry"),
      signatureDate: toIsoDate(childText(signatureBlock, "signatureDate")),
    },
  };
}

function parseVotingAuthority(node: XmlNode | null): ThirteenFVotingAuthority {
  return {
    sole: parseOptionalNumber(valueOf(childLocal(node, "Sole") ?? childLocal(node, "sole"))),
    shared: parseOptionalNumber(valueOf(childLocal(node, "Shared") ?? childLocal(node, "shared"))),
    none: parseOptionalNumber(valueOf(childLocal(node, "None") ?? childLocal(node, "none"))),
  };
}

/**
 * Parses a 13F information table XML document into position rows.
 */
export function parse13FInformationTable(xml: string): ThirteenFInfoEntry[] {
  const root = parseXml(xml);
  const rows = localName(root.name) === "infoTable" ? [root] : childrenNamed(root, "infoTable");

  return rows.map((row) => {
    const sharesNode = childLocal(row, "shrsOrPrnAmt");

    return {
      sourceRowId: null,
      nameOfIssuer: childText(row, "nameOfIssuer") ?? "",
      titleOfClass: childText(row, "titleOfClass") ?? "",
      cusip: (childText(row, "cusip") ?? "").toUpperCase(),
      figi: childText(row, "figi"),
      valueAsReported: parseOptionalNumber(childText(row, "value")),
      shares: parseOptionalNumber(childText(sharesNode, "sshPrnamt")),
      shareType: childText(sharesNode, "sshPrnamtType"),
      putCall: childText(row, "putCall"),
      investmentDiscretion: childText(row, "investmentDiscretion"),
      otherManager: childText(row, "otherManager"),
      votingAuthority: parseVotingAuthority(childLocal(row, "votingAuthority")),
    };
  });
}

/**
 * Resolves a reported CUSIP through an explicit local mapping. CUSIPs are
 * never matched to assets by issuer name, which avoids false positives.
 */
export function resolveCusip(cusip: string | null, map: CusipMap = {}): CusipResolution {
  const key = cusip?.trim().toUpperCase();
  const match = key ? map[key] : undefined;

  if (!match) {
    return { status: "unmapped", assetId: null, ticker: null, name: null };
  }

  return {
    status: "mapped",
    assetId: match.assetId,
    ticker: match.ticker,
    name: match.name,
  };
}

/**
 * Loads a CUSIP map from either an object keyed by CUSIP or an array of
 * `{ cusip, assetId, ticker?, name? }` records. Invalid entries are skipped.
 */
export function parseCusipMap(payload: unknown): CusipMap {
  const map: CusipMap = {};

  const add = (cusip: unknown, value: unknown): void => {
    if (typeof cusip !== "string" || cusip.trim() === "") {
      return;
    }
    if (typeof value !== "object" || value === null) {
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record["assetId"] !== "string" || record["assetId"].trim() === "") {
      return;
    }
    map[cusip.trim().toUpperCase()] = {
      assetId: record["assetId"],
      ticker: typeof record["ticker"] === "string" ? record["ticker"] : null,
      name: typeof record["name"] === "string" ? record["name"] : null,
    };
  };

  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;
        add(record["cusip"], record);
      }
    }
    return map;
  }

  if (typeof payload === "object" && payload !== null) {
    for (const [cusip, value] of Object.entries(payload as Record<string, unknown>)) {
      add(cusip, value);
    }
  }

  return map;
}

export async function loadCusipMap(filePath: string): Promise<CusipMap> {
  const raw = await fs.readFile(filePath, "utf-8");
  return parseCusipMap(JSON.parse(raw) as unknown);
}

function splitManagers(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
}

function addNumber(target: number, value: number | null): number {
  return target + (value ?? 0);
}

function compareFilingOrder(a: ThirteenFFilingInput, b: ThirteenFFilingInput): number {
  if (a.filingDate !== b.filingDate) {
    return a.filingDate.localeCompare(b.filingDate);
  }
  return a.accessionNumber.localeCompare(b.accessionNumber);
}

function entryIdentity(entry: ThirteenFInfoEntry): string {
  if (entry.sourceRowId) {
    return `row:${entry.sourceRowId}`;
  }
  return [
    entry.cusip,
    entry.titleOfClass,
    entry.putCall ?? "",
    entry.investmentDiscretion ?? "",
    entry.otherManager ?? "",
    entry.shares ?? "",
    entry.valueAsReported ?? "",
  ].join("|");
}

function mergeEntries(
  existing: Array<{ entry: ThirteenFInfoEntry; filing: ThirteenFFilingInput }>,
  incoming: Array<{ entry: ThirteenFInfoEntry; filing: ThirteenFFilingInput }>,
): Array<{ entry: ThirteenFInfoEntry; filing: ThirteenFFilingInput }> {
  const seen = new Set(existing.map((item) => entryIdentity(item.entry)));
  const merged = [...existing];

  for (const item of incoming) {
    const identity = entryIdentity(item.entry);
    if (!seen.has(identity)) {
      seen.add(identity);
      merged.push(item);
    }
  }

  return merged;
}

function aggregateEntries(
  items: Array<{ entry: ThirteenFInfoEntry; filing: ThirteenFFilingInput }>,
  reportPeriod: string,
  cusipMap: CusipMap,
): ThirteenFHolding[] {
  const groups = new Map<
    string,
    Array<{ entry: ThirteenFInfoEntry; filing: ThirteenFFilingInput }>
  >();

  for (const item of items) {
    const key = [
      item.entry.cusip,
      item.entry.titleOfClass,
      item.entry.putCall ?? "",
      item.entry.shareType ?? "",
    ].join("|");
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const holdings: ThirteenFHolding[] = [];

  for (const group of groups.values()) {
    const latest = [...group].sort((a, b) => compareFilingOrder(a.filing, b.filing)).at(-1);
    if (!latest) {
      continue;
    }

    const normalizedValues = group.map((item) =>
      normalize13FValue(item.entry.valueAsReported, item.filing.filingDate || null),
    );
    const units = new Set(
      normalizedValues
        .map((value) => value.valueUnit)
        .filter((unit): unit is ThirteenFValueUnit => unit !== null),
    );
    const latestValue = normalize13FValue(
      latest.entry.valueAsReported,
      latest.filing.filingDate || null,
    );

    const filingRefsByAccession = new Map<string, ThirteenFHolding["filingRefs"][number]>();
    for (const item of group) {
      filingRefsByAccession.set(item.filing.accessionNumber, {
        accessionNumber: item.filing.accessionNumber,
        filingDate: item.filing.filingDate,
        form: item.filing.form,
        amendmentType: item.filing.amendmentType,
      });
    }

    const filingRefs = [...filingRefsByAccession.values()].sort((a, b) =>
      a.filingDate.localeCompare(b.filingDate),
    );

    const otherManagers = new Set<string>();
    for (const item of group) {
      for (const manager of splitManagers(item.entry.otherManager)) {
        otherManagers.add(manager);
      }
    }

    const investmentDiscretions = new Set<string>();
    for (const item of group) {
      if (item.entry.investmentDiscretion) {
        investmentDiscretions.add(item.entry.investmentDiscretion);
      }
    }

    const votingAuthority = group.reduce<ThirteenFVotingAuthority>(
      (total, item) => ({
        sole: addNumber(total.sole ?? 0, item.entry.votingAuthority.sole),
        shared: addNumber(total.shared ?? 0, item.entry.votingAuthority.shared),
        none: addNumber(total.none ?? 0, item.entry.votingAuthority.none),
      }),
      { sole: null, shared: null, none: null },
    );

    const resolution = resolveCusip(latest.entry.cusip, cusipMap);
    const shares = sumNullable(group.map((item) => item.entry.shares));
    const valueUsd = sumNullable(normalizedValues.map((value) => value.valueUsd));

    holdings.push({
      cusip: latest.entry.cusip,
      nameOfIssuer: latest.entry.nameOfIssuer,
      titleOfClass: latest.entry.titleOfClass,
      putCall: latest.entry.putCall,
      shares,
      shareType: latest.entry.shareType,
      valueAsReported: sumNullable(normalizedValues.map((value) => value.valueAsReported)),
      valueUnit: latestValue.valueUnit,
      valueUnitSource: "sec_filing_date_rule",
      valueUnitMixed: units.size > 1,
      valueUsd,
      impliedPricePerShare:
        valueUsd !== null && shares !== null && shares > 0
          ? Math.round((valueUsd / shares) * 100) / 100
          : null,
      investmentDiscretions: [...investmentDiscretions].sort(),
      otherManagers: [...otherManagers].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
      votingAuthority,
      entryCount: group.length,
      filingDate: latest.filing.filingDate,
      reportPeriod,
      accessionNumber: latest.filing.accessionNumber,
      form: latest.filing.form,
      amendmentType: latest.filing.amendmentType,
      filingRefs,
      assetId: resolution.assetId,
      assetResolution: resolution.status,
      ticker: resolution.ticker,
      name: resolution.name,
    });
  }

  return holdings.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
}

function periodTotals(holdings: ThirteenFHolding[]): ThirteenFPeriod["totals"] {
  const sharesByType: Record<string, number> = {};

  for (const holding of holdings) {
    const type = holding.shareType ?? "UNKNOWN";
    sharesByType[type] = (sharesByType[type] ?? 0) + (holding.shares ?? 0);
  }

  return {
    positions: holdings.length,
    valueUsd: holdings.reduce((total, holding) => total + (holding.valueUsd ?? 0), 0),
    sharesByType,
  };
}

/**
 * Applies amendment rules and aggregates positions per report period.
 *
 * A later non-amendment report replaces the active entries. A RESTATEMENT
 * amendment replaces them; a NEW HOLDINGS amendment appends its rows.
 */
export function buildThirteenFPeriods(
  filings: ThirteenFFilingInput[],
  cusipMap: CusipMap = {},
): ThirteenFPeriod[] {
  const groups = new Map<string, ThirteenFFilingInput[]>();

  for (const filing of filings) {
    const key = filing.reportDate || filing.coverPage?.reportCalendarOrQuarter || "unknown";
    const group = groups.get(key);
    if (group) {
      group.push(filing);
    } else {
      groups.set(key, [filing]);
    }
  }

  const periods: ThirteenFPeriod[] = [];

  for (const [reportPeriod, group] of groups) {
    const sorted = [...group].sort(compareFilingOrder);
    let active: Array<{ entry: ThirteenFInfoEntry; filing: ThirteenFFilingInput }> = [];

    for (const filing of sorted) {
      const incoming = filing.entries.map((entry) => ({ entry, filing }));

      if (active.length === 0) {
        active = incoming;
      } else if (filing.isAmendment) {
        if (filing.amendmentType === "RESTATEMENT") {
          active = incoming;
        } else {
          active = mergeEntries(active, incoming);
        }
      } else {
        active = incoming;
      }
    }

    const holdings = aggregateEntries(active, reportPeriod, cusipMap);

    periods.push({
      reportPeriod,
      holdings,
      filings: sorted.map((filing) => ({
        form: filing.form,
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate,
        isAmendment: filing.isAmendment,
        amendmentType: filing.amendmentType,
        informationTableUrl: filing.informationTableUrl,
      })),
      totals: periodTotals(holdings),
    });
  }

  return periods.sort((a, b) => b.reportPeriod.localeCompare(a.reportPeriod));
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

function xmlCandidates(files: string[]): string[] {
  return files
    .filter((name) => name.toLowerCase().endsWith(".xml"))
    .filter((name) => !name.toLowerCase().includes("primary_doc"))
    .sort((a, b) => a.localeCompare(b));
}

async function fetchCoverPage(
  cik: string,
  filing: SecFiling,
  files: string[],
): Promise<{ url: string; xml: string } | null> {
  const preferred = getRawFilingDocumentUrl(cik, filing.accessionNumber, filing.primaryDocument);
  const direct = await fetchText(preferred, "application/xml");
  if (direct.ok && direct.text.includes("<edgarSubmission")) {
    return { url: preferred, xml: direct.text };
  }

  const primary = files.find((name) => name.toLowerCase() === "primary_doc.xml");
  const fallbacks = [...(primary ? [primary] : []), ...xmlCandidates(files)];

  for (const candidate of fallbacks) {
    const url = getFilingDocumentUrl(cik, filing.accessionNumber, candidate);
    const result = await fetchText(url, "application/xml");
    if (result.ok && result.text.includes("<edgarSubmission")) {
      return { url, xml: result.text };
    }
  }

  return null;
}

async function fetchInformationTable(
  cik: string,
  filing: SecFiling,
  files: string[],
): Promise<{ url: string; xml: string } | null> {
  const candidates = xmlCandidates(files).sort((a, b) => {
    const aScore = /info.*table|13f/i.test(a) ? 0 : 1;
    const bScore = /info.*table|13f/i.test(b) ? 0 : 1;
    return aScore - bScore;
  });

  for (const candidate of candidates) {
    const url = getFilingDocumentUrl(cik, filing.accessionNumber, candidate);
    const result = await fetchText(url, "application/xml");
    if (result.ok && result.text.includes("<informationTable")) {
      return { url, xml: result.text };
    }
  }

  return null;
}

function select13FFilings(filings: SecFiling[], maxPeriods: number): SecFiling[] {
  const reportPeriods = [...new Set(filings.map((filing) => filing.reportDate))]
    .filter((period) => period !== "")
    .sort((a, b) => b.localeCompare(a))
    .slice(0, Math.max(1, maxPeriods));

  const selected = new Set(reportPeriods);
  return filings.filter((filing) => selected.has(filing.reportDate));
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

export interface CollectManager13FOptions {
  cik: string | number;
  maxPeriods?: number;
  cusipMap?: CusipMap;
  refreshSubmissions?: boolean;
  outputFilename?: string;
}

/**
 * Collects and normalizes 13F-HR / 13F-HR/A filings for one manager.
 */
export async function collectManager13F(
  options: CollectManager13FOptions,
): Promise<ThirteenFManagerReport> {
  const cik = String(options.cik);
  const maxPeriods = Math.max(1, options.maxPeriods ?? 4);
  const cusipMap = options.cusipMap ?? {};

  const submissions = await loadSubmissions(cik, options.refreshSubmissions ?? false);
  const allFilings = parseRecentFilings(submissions, cik).filter(
    (filing) => filing.form === "13F-HR" || filing.form === "13F-HR/A",
  );

  const selected = select13FFilings(allFilings, maxPeriods);
  const filingInputs: ThirteenFFilingInput[] = [];
  const errors: ThirteenFManagerReport["errors"] = [];
  let managerName = typeof submissions["name"] === "string" ? submissions["name"] : "";

  console.log(
    `Collecting ${selected.length} Form 13F filing(s) for CIK ${cik} ` +
      `across ${Math.min(maxPeriods, new Set(selected.map((f) => f.reportDate)).size)} period(s)...`,
  );

  for (const filing of selected) {
    try {
      const files = await fetchIndexFiles(cik, filing.accessionNumber);
      const cover = await fetchCoverPage(cik, filing, files);
      const coverPage = cover ? parse13FCoverPage(cover.xml) : null;
      const infoTable = await fetchInformationTable(cik, filing, files);

      if (coverPage?.filingManagerName && managerName === "") {
        managerName = coverPage.filingManagerName;
      }

      if (!infoTable) {
        errors.push({
          accessionNumber: filing.accessionNumber,
          form: filing.form,
          message: "13F information table not found in filing directory.",
        });
        console.warn(`  ! ${filing.form} ${filing.accessionNumber}: information table not found`);
      }

      const reportDate =
        coverPage?.reportCalendarOrQuarter ?? toIsoDate(filing.reportDate) ?? filing.reportDate;
      const entries = infoTable ? parse13FInformationTable(infoTable.xml) : [];

      filingInputs.push({
        form: filing.form,
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate,
        reportDate,
        isAmendment: filing.form.endsWith("/A") || (coverPage?.isAmendment ?? false),
        amendmentType: coverPage?.amendmentType ?? null,
        entries,
        coverPage,
        primaryDocumentUrl: cover?.url ?? null,
        informationTableUrl: infoTable?.url ?? null,
      });

      console.log(
        `  ✓ ${filing.form} ${filing.filingDate} ${filing.accessionNumber} ` +
          `(${entries.length} row(s))`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ accessionNumber: filing.accessionNumber, form: filing.form, message });
      console.warn(`  ! ${filing.form} ${filing.accessionNumber}: ${message}`);
    }
  }

  const report: ThirteenFManagerReport = {
    source: "SEC EDGAR Form 13F",
    cik,
    managerName,
    generatedAt: new Date().toISOString(),
    periods: buildThirteenFPeriods(filingInputs, cusipMap),
    errors,
  };

  await saveJson(options.outputFilename ?? `Edgar 13f_CIK${cik}.json`, report);
  return report;
}

/* -------------------------------------------------------------------------- */
/*                             13F bulk data set                              */
/* -------------------------------------------------------------------------- */

/**
 * Reads the entries of a ZIP archive using only Node's zlib. Supports stored
 * (method 0) and deflated (method 8) entries, which covers SEC data sets.
 */
export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
  const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
  const LOCAL_FILE_HEADER = 0x04034b50;

  let endOffset = -1;
  const earliest = Math.max(0, buffer.length - 65557);

  for (let offset = buffer.length - 22; offset >= earliest; offset--) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset === -1) {
    throw new Error("Not a ZIP archive: end of central directory not found.");
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map<string, Buffer>();
  let pointer = centralOffset;

  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(pointer) !== CENTRAL_DIRECTORY_ENTRY) {
      throw new Error("Malformed ZIP archive: invalid central directory entry.");
    }

    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength);

    pointer += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) {
      continue;
    }

    if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      throw new Error(`Malformed ZIP archive: invalid local header for ${name}.`);
    }

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      entries.set(name, Buffer.from(compressed));
    } else if (method === 8) {
      entries.set(name, inflateRawSync(compressed));
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}.`);
    }
  }

  return entries;
}

/**
 * Parses a tab-separated file with a header row. Values are kept as strings;
 * callers decide how to treat blanks and numbers.
 */
export function parseTsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() !== "");

  if (headerIndex === -1) {
    return [];
  }

  const headers = (lines[headerIndex] ?? "").split("\t").map((header) => header.trim());
  const rows: Array<Record<string, string>> = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (line === "") {
      continue;
    }
    const cells = line.split("\t");
    const row: Record<string, string> = {};
    for (let index = 0; index < headers.length; index++) {
      const header = headers[index];
      if (header) {
        row[header] = cells[index] ?? "";
      }
    }
    rows.push(row);
  }

  return rows;
}

function bulkEntry(row: Record<string, string>): ThirteenFInfoEntry {
  return {
    sourceRowId: emptyToNull(row["INFOTABLE_SK"]),
    nameOfIssuer: row["NAMEOFISSUER"] ?? "",
    titleOfClass: row["TITLEOFCLASS"] ?? "",
    cusip: (row["CUSIP"] ?? "").toUpperCase(),
    figi: emptyToNull(row["FIGI"]),
    valueAsReported: parseOptionalNumber(row["VALUE"]),
    shares: parseOptionalNumber(row["SSHPRNAMT"]),
    shareType: emptyToNull(row["SSHPRNAMTTYPE"]),
    putCall: emptyToNull(row["PUTCALL"]),
    investmentDiscretion: emptyToNull(row["INVESTMENTDISCRETION"]),
    otherManager: emptyToNull(row["OTHERMANAGER"]),
    votingAuthority: {
      sole: parseOptionalNumber(row["VOTING_AUTH_SOLE"]),
      shared: parseOptionalNumber(row["VOTING_AUTH_SHARED"]),
      none: parseOptionalNumber(row["VOTING_AUTH_NONE"]),
    },
  };
}

function lastDayOfFebruary(year: number): number {
  return new Date(Date.UTC(year, 2, 0)).getUTCDate();
}

/**
 * Returns the candidate SEC URLs for a quarterly Form 13F data set.
 *
 * The data set is organized by filing window, not by report period:
 *   Q1 -> Mar-May, Q2 -> Jun-Aug, Q3 -> Sep-Nov, Q4 -> Dec-Feb (next year).
 * Data sets through 2023 use `{year}q{quarter}` names; 2024+ use month ranges.
 * The newest posting may live under the datastandardsinnovation path.
 */
export function get13FBulkDatasetUrls(year: number, quarter: number): string[] {
  const baseNames = "https://www.sec.gov/files";

  let filename: string;
  if (year <= 2023) {
    filename = `form-13f-data-sets/${year}q${quarter}_form13f.zip`;
  } else {
    const windows: Record<number, { from: string; to: string }> = {
      1: { from: "01mar", to: `31may${year}` },
      2: { from: "01jun", to: `31aug${year}` },
      3: { from: "01sep", to: `30nov${year}` },
      4: {
        from: "01dec",
        to: `${String(lastDayOfFebruary(year + 1)).padStart(2, "0")}feb${year + 1}`,
      },
    };

    const window = windows[quarter];
    if (!window) {
      throw new Error(`Invalid 13F bulk quarter: ${quarter}. Expected 1-4.`);
    }

    filename = `form-13f-data-sets/${window.from}${year}-${window.to}_form13f.zip`;
  }

  return [
    `${baseNames}/structureddata/data/${filename}`,
    `${baseNames}/datastandardsinnovation/data/${filename}`,
  ];
}

export async function download13FBulkDataset(
  year: number,
  quarter: number,
): Promise<{ buffer: Buffer; url: string }> {
  const urls = get13FBulkDatasetUrls(year, quarter);
  let lastStatus = 0;

  for (const url of urls) {
    const response = await rateLimitedFetch(url, { headers: { Accept: "application/zip" } });
    lastStatus = response.status;

    if (response.ok) {
      return { buffer: Buffer.from(await response.arrayBuffer()), url };
    }
  }

  throw new Error(
    `13F bulk data set download failed (last status ${lastStatus}) for ${urls.join(", ")}`,
  );
}

export interface Process13FBulkOptions {
  cusips: string[];
  assetId?: string | null;
  cusipMap?: CusipMap;
  dataset?: {
    year: number | null;
    quarter: number | null;
    url: string | null;
    zipPath: string | null;
  };
}

/**
 * Extracts every manager position for the target CUSIP(s) from a Form 13F
 * quarterly data set ZIP, applying amendments and value normalization.
 */
export function process13FBulkDataset(
  zipBuffer: Buffer,
  options: Process13FBulkOptions,
): ThirteenFBulkReport {
  const entries = readZipEntries(zipBuffer);
  const required = ["SUBMISSION.tsv", "COVERPAGE.tsv", "INFOTABLE.tsv"];
  for (const name of required) {
    if (!entries.has(name)) {
      throw new Error(`13F data set is missing ${name}.`);
    }
  }

  const submissions = parseTsv(entries.get("SUBMISSION.tsv")?.toString("utf8") ?? "");
  const coverPages = parseTsv(entries.get("COVERPAGE.tsv")?.toString("utf8") ?? "");
  const infoTables = parseTsv(entries.get("INFOTABLE.tsv")?.toString("utf8") ?? "");

  const submissionByAccession = new Map(
    submissions.map((row) => [row["ACCESSION_NUMBER"] ?? "", row]),
  );
  const coverByAccession = new Map(coverPages.map((row) => [row["ACCESSION_NUMBER"] ?? "", row]));

  const targets = new Set(
    options.cusips.map((cusip) => cusip.trim().toUpperCase()).filter(Boolean),
  );
  const matchedCusips = new Set<string>();
  const rowsByAccession = new Map<string, ThirteenFInfoEntry[]>();

  for (const row of infoTables) {
    const cusip = (row["CUSIP"] ?? "").trim().toUpperCase();
    if (!targets.has(cusip)) {
      continue;
    }
    matchedCusips.add(cusip);
    const accession = row["ACCESSION_NUMBER"] ?? "";
    const entry = bulkEntry(row);
    const group = rowsByAccession.get(accession);
    if (group) {
      group.push(entry);
    } else {
      rowsByAccession.set(accession, [entry]);
    }
  }

  const effectiveMap: CusipMap = { ...(options.cusipMap ?? {}) };
  if (options.assetId) {
    for (const cusip of targets) {
      effectiveMap[cusip] = {
        assetId: options.assetId,
        ticker: options.assetId,
        name: effectiveMap[cusip]?.name ?? null,
      };
    }
  }

  const filingsByManager = new Map<string, ThirteenFFilingInput[]>();
  const managerNames = new Map<string, string>();
  const errors: string[] = [];

  for (const [accession, entriesForAccession] of rowsByAccession) {
    const submission = submissionByAccession.get(accession);
    if (!submission) {
      errors.push(`No SUBMISSION.tsv row for accession ${accession}.`);
      continue;
    }

    const cik = submission["CIK"] ?? "";
    const form = submission["SUBMISSIONTYPE"] ?? "";
    const filingDate = toIsoDate(submission["FILING_DATE"]) ?? "";
    const reportDate = toIsoDate(submission["PERIODOFREPORT"]) ?? "";
    const cover = coverByAccession.get(accession);
    const amendmentType = normalizeAmendmentType(cover?.["AMENDMENTTYPE"] ?? null);

    const input: ThirteenFFilingInput = {
      form,
      accessionNumber: accession,
      filingDate,
      reportDate,
      isAmendment: form.endsWith("/A") || cover?.["ISAMENDMENT"] === "Y",
      amendmentType,
      entries: entriesForAccession,
      coverPage: null,
      primaryDocumentUrl: null,
      informationTableUrl: null,
    };

    const group = filingsByManager.get(cik);
    if (group) {
      group.push(input);
    } else {
      filingsByManager.set(cik, [input]);
    }

    const managerName = cover?.["FILINGMANAGER_NAME"];
    if (managerName) {
      managerNames.set(cik, managerName);
    }
  }

  const managers: ThirteenFBulkManager[] = [];
  for (const [cik, filings] of filingsByManager) {
    managers.push({
      cik,
      managerName: managerNames.get(cik) ?? "",
      periods: buildThirteenFPeriods(filings, effectiveMap),
    });
  }

  managers.sort((a, b) => {
    const aValue = a.periods.reduce((total, period) => total + period.totals.valueUsd, 0);
    const bValue = b.periods.reduce((total, period) => total + period.totals.valueUsd, 0);
    return bValue - aValue;
  });

  const allHoldings = managers.flatMap((manager) =>
    manager.periods.flatMap((period) => period.holdings),
  );
  const sharesByType: Record<string, number> = {};
  for (const holding of allHoldings) {
    const type = holding.shareType ?? "UNKNOWN";
    sharesByType[type] = (sharesByType[type] ?? 0) + (holding.shares ?? 0);
  }

  const unmatchedCusips = [...targets].filter((cusip) => !matchedCusips.has(cusip));

  return {
    source: "SEC EDGAR Form 13F bulk data set",
    dataset: {
      year: options.dataset?.year ?? null,
      quarter: options.dataset?.quarter ?? null,
      url: options.dataset?.url ?? null,
      zipPath: options.dataset?.zipPath ?? null,
      generatedAt: new Date().toISOString(),
    },
    target: {
      cusips: [...targets],
      assetId: options.assetId ?? null,
      unmatchedCusips,
    },
    managers,
    totals: {
      managers: managers.length,
      positions: allHoldings.length,
      valueUsd: allHoldings.reduce((total, holding) => total + (holding.valueUsd ?? 0), 0),
      sharesByType,
    },
    errors,
  };
}

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function runManagerCli(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const cik = getArg("cik") ?? "1067983";
  const maxPeriods = Number.parseInt(getArg("max-periods") ?? "4", 10);
  const mapPath = getArg("map");
  const cusipMap = mapPath ? await loadCusipMap(mapPath) : {};
  const outputFilename = getArg("output");

  const report = await collectManager13F({
    cik,
    maxPeriods: Number.isFinite(maxPeriods) ? maxPeriods : 4,
    cusipMap,
    refreshSubmissions: getArg("refresh") === "true",
    ...(outputFilename ? { outputFilename } : {}),
  });

  console.log("\nForm 13F manager summary:");
  console.log(`  Manager: ${report.managerName}`);
  console.log(`  Periods: ${report.periods.length}`);
  for (const period of report.periods) {
    console.log(
      `    ${period.reportPeriod}: ${period.holdings.length} position(s), ` +
        `$${period.totals.valueUsd.toLocaleString()}`,
    );
  }
  if (report.errors.length > 0) {
    console.log(`  Errors:  ${report.errors.length}`);
  }
}

async function runBulkCli(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const cusipArg = getArg("cusips") ?? getArg("cusip");
  const cusips = (cusipArg ?? "")
    .split(",")
    .map((cusip) => cusip.trim())
    .filter((cusip) => cusip !== "");

  if (cusips.length === 0) {
    throw new Error("Bulk mode requires --cusip=... or --cusips=...");
  }

  const zipPath = getArg("zip");
  const yearArg = getArg("year");
  const quarterArg = getArg("quarter");
  const year = yearArg ? Number.parseInt(yearArg, 10) : null;
  const quarter = quarterArg ? Number.parseInt(quarterArg, 10) : null;
  const mapPath = getArg("map");
  const cusipMap = mapPath ? await loadCusipMap(mapPath) : {};

  let buffer: Buffer;
  let datasetUrl: string | null = null;
  let datasetZipPath: string | null = zipPath;

  if (zipPath) {
    buffer = await fs.readFile(zipPath);
  } else {
    if (year === null || quarter === null) {
      throw new Error("Bulk mode requires --zip=... or both --year=... and --quarter=...");
    }
    const downloaded = await download13FBulkDataset(year, quarter);
    buffer = downloaded.buffer;
    datasetUrl = downloaded.url;
    datasetZipPath = null;
  }

  const report = process13FBulkDataset(buffer, {
    cusips,
    assetId: getArg("asset"),
    cusipMap,
    dataset: { year, quarter, url: datasetUrl, zipPath: datasetZipPath },
  });

  const key = year !== null && quarter !== null ? `${year}q${quarter}` : "local";
  const filename = getArg("output") ?? `Edgar 13f bulk_${key}_${cusips.join("-")}.json`;
  await saveJson(filename, report);

  console.log("\nForm 13F bulk summary:");
  console.log(`  Target CUSIP(s): ${cusips.join(", ")}`);
  console.log(`  Managers:       ${report.totals.managers}`);
  console.log(`  Positions:      ${report.totals.positions}`);
  console.log(`  Value (USD):    $${report.totals.valueUsd.toLocaleString()}`);
  if (report.target.unmatchedCusips.length > 0) {
    console.log(`  Unmatched:      ${report.target.unmatchedCusips.join(", ")}`);
  }
  if (report.errors.length > 0) {
    console.log(`  Errors:         ${report.errors.length}`);
  }
}

async function main(): Promise<void> {
  if (getArg("zip") || getArg("year") || getArg("cusip") || getArg("cusips")) {
    await runBulkCli();
  } else {
    await runManagerCli();
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
