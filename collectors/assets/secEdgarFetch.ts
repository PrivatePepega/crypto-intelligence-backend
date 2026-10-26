import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

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
function padCik(cik: string | number): string {
  return String(cik).padStart(10, "0");
}

const SEC_WWW_BASE = "https://www.sec.gov";
const SEC_DATA_BASE = "https://data.sec.gov";
const USER_AGENT = "CryptoIntelligencePlatform fernandojcastellanos@gmail.com";

const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/data");

// Rate limiting: min delay between requests (1000ms = 1 req/sec max)
const MIN_REQUEST_INTERVAL_MS = 1000;
let lastRequestTime = 0;

async function rateLimitedFetch(url: string, opts: RequestInit = {}): Promise<Response> {
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
    response = await fetch(url, { ...opts, headers });

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

async function saveJson(filename: string, data: unknown): Promise<void> {
  const filePath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`  ✓ Wrote ${filePath}`);
}

/**
 * 1. Company ticker and exchange directory (Essential)
 * https://www.sec.gov/files/company_tickers_exchange.json
 */
async function fetchCompanyTickersExchange(): Promise<void> {
  const url = `${SEC_WWW_BASE}/files/company_tickers_exchange.json`;
  console.log(`Fetching ${url}...`);

  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`SEC request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  const data = await response.json();
  await saveJson("Edgar company_tickers_exchange.json", data);
  console.log(`    Status: ${response.status}`);
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
async function fetchCompanyFacts(cik: string): Promise<void> {
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

main().catch((error) => {
  console.error("SEC Edgar collection failed:", error);
  process.exitCode = 1;
});
