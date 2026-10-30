import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * SEC Edgar data collector.
 *
 * Fetches SEC Edgar endpoints and saves each response as an individual JSON
 * file under `collectors/assets/data/` with `Edgar ` prefix:
 *
 *   GET https://www.sec.gov/files/company_tickers_exchange.json
 *     → Edgar company_tickers_exchange.json
 *
 * Additional utility functions are provided for:
 *   - Company submissions: https://data.sec.gov/submissions/CIK{cik}.json
 *   - Company Facts:       https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json
 *   - Company Concept:     https://data.sec.gov/api/xbrl/companyconcept/CIK{cik}/{taxonomy}/{tag}.json
 *   - XBRL Frames:         https://data.sec.gov/api/xbrl/frames/{taxonomy}/{tag}/{unit}/{period}.json
 *
 * Rate limiting: max 10 requests per second. Handles 429 responses with
 * exponential backoff.
 *
 * User-Agent header is required by SEC:
 *   User-Agent: CryptoIntelligencePlatform fernandojcastellanos@gmail.com
 *
 * Run with: npx tsx collectors/assets/secEdgarFetch.ts
 */

/**
 * Pads a CIK to 10 digits with leading zeros (SEC requirement).
 * e.g., "320193" → "0000320193"
 */
export function padCik(cik: string | number): string {
  return String(cik).padStart(10, "0");
}

export const SEC_WWW_BASE = "https://www.sec.gov";
export const SEC_DATA_BASE = "https://data.sec.gov";
export const USER_AGENT = "CryptoIntelligencePlatform fernandojcastellanos@gmail.com";

export const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/stocks/data");

// Rate limiting: min delay between requests (1000ms = 1 req/sec max)
const MIN_REQUEST_INTERVAL_MS = 1000;
/** A stalled SEC connection must not block a collection run forever. */
const SEC_REQUEST_TIMEOUT_MS = 30_000;
let lastRequestTime = 0;

export async function rateLimitedFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  // Enforce minimum interval between requests
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    ...((opts.headers as Record<string, string>) ?? {}),
  };

  let response: Response | undefined;

  // Retry with exponential backoff on 429
  let attempt = 0;
  const maxAttempts = 5;
  while (attempt < maxAttempts) {
    response = await fetch(url, {
      ...opts,
      headers,
      signal: opts.signal ?? AbortSignal.timeout(SEC_REQUEST_TIMEOUT_MS),
    });

    if (response.status !== 429) {
      break;
    }

    attempt++;
    const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, 16s, 32s
    console.warn(
      `  ⚠ Rate limited (429) on ${url}, retrying in ${backoffMs}ms (attempt ${attempt}/${maxAttempts})`,
    );
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  if (!response) {
    throw new Error(`SEC request failed after ${maxAttempts} attempts for ${url}`);
  }

  lastRequestTime = Date.now();
  return response;
}

export async function saveJson(filename: string, data: unknown): Promise<void> {
  const filePath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`  ✓ Wrote ${filePath}`);
}

/**
 * Loads a company's submissions document, preferring the cached copy under
 * `collectors/assets/data/` so repeated research runs do not re-download a
 * payload that changes only when the company files.
 *
 * Pass `refresh: true` to force a fresh request.
 */
export async function loadCompanySubmissions(
  cik: string | number,
  refresh = false,
): Promise<Record<string, unknown>> {
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

/**
 * Fetches a filing document as text.
 *
 * Documents are read transiently for extraction and are deliberately not
 * persisted: the collector stores the document URL, not a copy of the filing.
 */
export async function fetchSecText(url: string): Promise<string> {
  const response = await rateLimitedFetch(url, {
    headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  });

  if (!response.ok) {
    throw new Error(`SEC document request failed: ${response.status} for ${url}`);
  }

  return response.text();
}

/**
 * 1. Company ticker and exchange directory (Essential)
 * https://www.sec.gov/files/company_tickers_exchange.json
 */
export async function loadCompanyTickersExchange(
  refresh = false,
): Promise<{ fields: string[]; data: Array<[number, string, string, string]> }> {
  const filename = "Edgar company_tickers_exchange.json";
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!refresh) {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf-8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  const url = `${SEC_WWW_BASE}/files/company_tickers_exchange.json`;
  console.log(`Fetching ${url}...`);

  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`SEC request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  const data = await response.json();
  await saveJson(filename, data);
  console.log(`    Status: ${response.status}`);
  return data;
}

async function fetchCompanyTickersExchange(): Promise<void> {
  await loadCompanyTickersExchange(true);
}

/**
 * 2. Company submissions and filing history (Essential)
 * https://data.sec.gov/submissions/CIK{cik}.json
 */
async function fetchCompanySubmissions(cik: string): Promise<void> {
  const paddedCik = padCik(cik);
  const url = `${SEC_DATA_BASE}/submissions/CIK${paddedCik}.json`;
  console.log(`Fetching ${url}...`);

  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`SEC request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  const data = await response.json();
  await saveJson(`Edgar submissions_CIK${cik}.json`, data);
  console.log(`    Status: ${response.status}`);
}

/**
 * 3. Company Facts — all supported standardized financial facts (Essential)
 * https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json
 */
export async function fetchCompanyFacts(cik: string): Promise<void> {
  const paddedCik = padCik(cik);
  const url = `${SEC_DATA_BASE}/api/xbrl/companyfacts/CIK${paddedCik}.json`;
  console.log(`Fetching ${url}...`);

  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`SEC request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  const data = await response.json();
  await saveJson(`Edgar companyfacts_CIK${cik}.json`, data);
  console.log(`    Status: ${response.status}`);
}

/**
 * 4. Company Concept — individual financial metric history (Useful, on demand)
 * https://data.sec.gov/api/xbrl/companyconcept/CIK{cik}/{taxonomy}/{tag}.json
 */
async function fetchCompanyConcept(cik: string, taxonomy: string, tag: string): Promise<void> {
  const paddedCik = padCik(cik);
  const url = `${SEC_DATA_BASE}/api/xbrl/companyconcept/CIK${paddedCik}/${taxonomy}/${tag}.json`;
  console.log(`Fetching ${url}...`);

  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`SEC request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  const data = await response.json();
  await saveJson(`Edgar companyconcept_CIK${cik}_${taxonomy}_${tag}.json`, data);
  console.log(`    Status: ${response.status}`);
}

/**
 * 5. XBRL Frames — comparable data across companies (Useful for comparisons)
 * https://data.sec.gov/api/xbrl/frames/{taxonomy}/{tag}/{unit}/{period}.json
 */
async function fetchXbrlFrames(
  taxonomy: string,
  tag: string,
  unit: string,
  period: string,
): Promise<void> {
  const url = `${SEC_DATA_BASE}/api/xbrl/frames/${taxonomy}/${tag}/${unit}/${period}.json`;
  console.log(`Fetching ${url}...`);

  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`SEC request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  const data = await response.json();
  await saveJson(`Edgar frames_${taxonomy}_${tag}_${unit}_${period}.json`, data);
  console.log(`    Status: ${response.status}`);
}

/**
 * Construct the directory index URL for a filing.
 *
 * https://www.sec.gov/Archives/edgar/data/{CIK_without_leading_zeros}/{accession_number_without_dashes}/
 *
 * This is the stable human-readable evidence link for a filing: it lists every
 * document in the submission rather than only the primary document.
 */
export function getFilingIndexUrl(cik: string | number, accessionNumber: string): string {
  const cikWithoutZeros = String(cik).replace(/^0+/, "");
  const accessionNoDashes = accessionNumber.replace(/-/g, "");
  return `${SEC_WWW_BASE}/Archives/edgar/data/${cikWithoutZeros}/${accessionNoDashes}/`;
}

/**
 * Construct the document URL for a SEC filing.
 *
 * https://www.sec.gov/Archives/edgar/data/{CIK_without_leading_zeros}/{accession_number_without_dashes}/{primaryDocument}
 *
 * Example:
 *   https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm
 */
export function getFilingDocumentUrl(
  cik: string | number,
  accessionNumber: string,
  primaryDocument: string,
): string {
  const cikWithoutZeros = String(cik).replace(/^0+/, "");
  const accessionNoDashes = accessionNumber.replace(/-/g, "");
  return `${SEC_WWW_BASE}/Archives/edgar/data/${cikWithoutZeros}/${accessionNoDashes}/${primaryDocument}`;
}

/**
 * Construct the URL of the raw (non-XSL-rendered) filing document.
 *
 * Submissions `primaryDocument` values for ownership and 13F filings usually
 * include an XSL viewer directory, e.g.:
 *   xslF345X05/wk-form4_1234567890.xml
 *   xslForm13F_X02/primary_doc.xml
 * The underlying document lives in the filing directory itself.
 */
export function getRawFilingDocumentUrl(
  cik: string | number,
  accessionNumber: string,
  primaryDocument: string,
): string {
  const filename = primaryDocument.includes("/")
    ? primaryDocument.slice(primaryDocument.lastIndexOf("/") + 1)
    : primaryDocument;
  return getFilingDocumentUrl(cik, accessionNumber, filename);
}

/**
 * Represents a parsed SEC filing from the submissions API.
 */
export interface SecFiling {
  form: string;
  filingDate: string;
  reportDate: string;
  accessionNumber: string;
  primaryDocument: string;
  primaryDocDescription: string;
  documentUrl: string;
}

/**
 * Parses the filings.recent parallel arrays from a submissions JSON response
 * into an array of SecFiling objects with document URLs.
 *
 * The JSON fields are parallel arrays: index i across every field describes
 * the same filing.
 */
export function parseRecentFilings(
  submissions: Record<string, unknown>,
  cik: string | number,
): SecFiling[] {
  const recent = submissions["filings"] as { recent?: Record<string, unknown[]> } | undefined;

  if (!recent?.recent) {
    return [];
  }

  const r = recent.recent;
  const forms = (r["form"] ?? []) as string[];
  const filingDates = (r["filingDate"] ?? []) as string[];
  const reportDates = (r["reportDate"] ?? []) as string[];
  const accessionNumbers = (r["accessionNumber"] ?? []) as string[];
  const primaryDocuments = (r["primaryDocument"] ?? []) as string[];
  const primaryDocDescriptions = (r["primaryDocDescription"] ?? []) as string[];

  const count = forms.length;
  const filings: SecFiling[] = [];

  for (let i = 0; i < count; i++) {
    filings.push({
      form: forms[i] ?? "",
      filingDate: filingDates[i] ?? "",
      reportDate: reportDates[i] ?? "",
      accessionNumber: accessionNumbers[i] ?? "",
      primaryDocument: primaryDocuments[i] ?? "",
      primaryDocDescription: primaryDocDescriptions[i] ?? "",
      documentUrl: getFilingDocumentUrl(cik, accessionNumbers[i] ?? "", primaryDocuments[i] ?? ""),
    });
  }

  return filings;
}

/**
 * Find the latest filing for a given form type.
 * Filters by form type and selects the newest filingDate.
 */
export function findLatestFilingByForm(filings: SecFiling[], formType: string): SecFiling | null {
  const matches = filings.filter((f) => f.form === formType);
  if (matches.length === 0) {
    return null;
  }

  return matches.reduce((latest, current) => {
    if (!latest.filingDate) return current;
    if (!current.filingDate) return latest;
    return current.filingDate >= latest.filingDate ? current : latest;
  });
}

/**
 * Find a filing by form type and report date (fiscal period).
 * Filters by form type, then matches reportDate to the desired period.
 */
export function findFilingByReportDate(
  filings: SecFiling[],
  formType: string,
  reportDate: string,
): SecFiling | null {
  const matches = filings.filter((f) => f.form === formType && f.reportDate === reportDate);
  if (matches.length === 0) {
    return null;
  }

  return matches[0] ?? null;
}

/**
 * Find the newest filing whose filingDate is on or before the given date.
 * This avoids using information that was not yet public at the time.
 */
export function findFilingAsOfDate(
  filings: SecFiling[],
  formType: string | null,
  asOfDate: string,
): SecFiling | null {
  const candidates = filings.filter((f) => {
    if (formType && f.form !== formType) {
      return false;
    }
    return f.filingDate <= asOfDate;
  });

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((latest, current) => {
    if (!latest.filingDate) return current;
    if (!current.filingDate) return latest;
    return current.filingDate >= latest.filingDate ? current : latest;
  });
}

/**
 * Find 8-K filings (recent events) within a date range.
 * Filing date must be on or after fromDate and on or before toDate.
 */
export function findFilingsByFormAndDateRange(
  filings: SecFiling[],
  formType: string,
  fromDate: string,
  toDate: string,
): SecFiling[] {
  return filings.filter(
    (f) => f.form === formType && f.filingDate >= fromDate && f.filingDate <= toDate,
  );
}

/**
 * Insider and ownership research forms.
 */
const INSIDER_OWNERSHIP_FORMS = new Set(["3", "4", "5", "13F-HR", "13F-HR/A", "SC 13D", "SC 13G"]);

/**
 * Find insider or ownership filings.
 * Filters for forms 3, 4, 5, 13F-HR, 13F-HR/A, SC 13D, SC 13G and amendments.
 */
export function findInsiderFilings(filings: SecFiling[]): SecFiling[] {
  return filings.filter((f) => INSIDER_OWNERSHIP_FORMS.has(f.form));
}

/**
 * Selection logic for finding a filing document URL.
 *
 * Priority:
 * 1. Search recent filings using the provided criteria
 * 2. If no match and historical files exist, note which file to check next
 *
 * Returns the matching filing or null with guidance on next steps.
 */
export function searchFilingDocument(
  submissions: Record<string, unknown>,
  cik: string | number,
  options: {
    formType?: string;
    reportDate?: string;
    asOfDate?: string;
    fromDate?: string;
    toDate?: string;
    insiderOwnership?: boolean;
  },
): {
  filing: SecFiling | null;
  historicalFilesToCheck: string[];
  message: string;
} {
  const filings = parseRecentFilings(submissions, cik);
  const historicalFiles: string[] = [];

  // Collect historical file names for fallback
  const files = (submissions["filings"] as { files?: Array<{ name: string }> } | undefined)?.files;
  if (files) {
    for (const file of files) {
      historicalFiles.push(file.name);
    }
  }

  let filing: SecFiling | null = null;
  let message = "";

  if (options.insiderOwnership) {
    const insider = findInsiderFilings(filings);
    if (insider.length > 0) {
      // Return the most recent insider filing
      filing = insider.reduce((latest, current) => {
        if (!latest.filingDate) return current;
        if (!current.filingDate) return latest;
        return current.filingDate >= latest.filingDate ? current : latest;
      });
      message = `Found ${insider.length} insider/ownership filing(s). Returned the most recent.`;
    } else {
      message = "No insider/ownership filings found in recent filings. Check historical files.";
    }
  } else if (options.reportDate && options.formType) {
    filing = findFilingByReportDate(filings, options.formType, options.reportDate);
    message = filing
      ? `Found ${options.formType} filing for report date ${options.reportDate}.`
      : `No ${options.formType} filing found for report date ${options.reportDate} in recent filings.`;
  } else if (options.asOfDate) {
    filing = findFilingAsOfDate(filings, options.formType ?? null, options.asOfDate);
    message = filing
      ? `Found latest filing on or before ${options.asOfDate}.`
      : `No filing found on or before ${options.asOfDate} in recent filings.`;
  } else if (options.fromDate && options.toDate && options.formType) {
    const range = findFilingsByFormAndDateRange(
      filings,
      options.formType,
      options.fromDate,
      options.toDate,
    );
    if (range.length > 0) {
      // Return the most recent in the range
      filing = range.reduce((latest, current) => {
        if (!latest.filingDate) return current;
        if (!current.filingDate) return latest;
        return current.filingDate >= latest.filingDate ? current : latest;
      });
      message = `Found ${range.length} ${options.formType} filing(s) in date range. Returned the most recent.`;
    } else {
      message = `No ${options.formType} filings found in date range ${options.fromDate} to ${options.toDate}.`;
    }
  } else if (options.formType) {
    filing = findLatestFilingByForm(filings, options.formType);
    message = filing
      ? `Found latest ${options.formType} filing.`
      : `No ${options.formType} filings found in recent filings.`;
  } else {
    message =
      "No search criteria provided. Specify formType, reportDate, asOfDate, date range, or insiderOwnership.";
  }

  if (!filing && historicalFiles.length > 0) {
    message += ` No match in recent filings. Check historical file(s): ${historicalFiles.join(", ")}`;
  }

  return { filing, historicalFilesToCheck: historicalFiles, message };
}

/**
 * Month names used by SEC date formats.
 */
const MONTHS_BY_NAME: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

/**
 * Converts SEC dates to YYYY-MM-DD.
 *
 * Accepts the formats that appear across the endpoints this collector uses:
 *   - YYYY-MM-DD  (submissions JSON, bulk TSVs)
 *   - DD-MON-YYYY (bulk TSVs)
 *   - MM-DD-YYYY  (13F XML)
 *   - MM/DD/YYYY  (13D/13G XML)
 *
 * Returns null for unknown formats instead of guessing.
 */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const dayMonth = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(trimmed);
  if (dayMonth) {
    const day = dayMonth[1];
    const monthToken = dayMonth[2];
    const year = dayMonth[3];
    if (!day || !monthToken || !year) {
      return null;
    }
    const month = MONTHS_BY_NAME[monthToken.toUpperCase()];
    return month ? `${year}-${month}-${day.padStart(2, "0")}` : null;
  }

  const monthDay = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed);
  if (monthDay) {
    const month = monthDay[1];
    const day = monthDay[2];
    const year = monthDay[3];
    if (!month || !day || !year) {
      return null;
    }
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

/**
 * Standalone entrypoint: refresh the general SEC Edgar data files.
 *
 * Guarded so importing this module from a collector does not start network
 * requests. The collectors call the exported helpers directly.
 */
async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log("Fetching SEC Edgar data...\n");

  // 1. Company tickers exchange directory (essential - always run)
  await fetchCompanyTickersExchange();

  // 2. Collect AAPL data (CIK: 320193)
  const AAPL_CIK = "320193";
  console.log(`\nFetching AAPL data (CIK: ${AAPL_CIK})...\n`);

  await fetchCompanySubmissions(AAPL_CIK);
  await fetchCompanyFacts(AAPL_CIK);

  console.log(`\nSEC Edgar collection complete.`);
  console.log(`  Output directory: ${OUTPUT_DIR}`);
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error("SEC Edgar collection failed:", error);
    process.exitCode = 1;
  });
}
