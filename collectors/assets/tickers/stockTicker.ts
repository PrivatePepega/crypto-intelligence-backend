/**
 * Stock Ticker Collector
 *
 * Fetches the SEC company tickers list from:
 *   https://www.sec.gov/files/company_tickers.json
 *
 * Dumps the raw JSON response into:
 *   collectors/assets/tickers/data/sec_company_tickers_<timestamp>.json
 *
 * Run with:
 *   npx tsx collectors/assets/tickers/stockTicker.ts
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

const SEC_URL = "https://www.sec.gov/files/company_tickers.json";
const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/tickers/data");

/**
 * Fetch the SEC company tickers JSON.
 * SEC requires a User-Agent header identifying the requester.
 */
async function fetchSecCompanyTickers(): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(SEC_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "crypto-intelligence-backend contact@example.com",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `SEC request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Write the SEC tickers JSON to a timestamped file.
 */
async function writeTickersFile(data: unknown): Promise<string> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `sec_company_tickers_${timestamp}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);

  await fs.writeFile(filepath, JSON.stringify(data, null, 2) + "\n");
  console.log(`[STOCK_TICKER] Wrote ${filepath}`);
  return filepath;
}

async function main(): Promise<void> {
  console.log("[STOCK_TICKER] Fetching SEC company tickers...");
  const data = await fetchSecCompanyTickers();
  const filepath = await writeTickersFile(data);
  console.log(`[STOCK_TICKER] Done. Output: ${filepath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[STOCK_TICKER] Failed:", error);
    process.exitCode = 1;
  });
}

export { fetchSecCompanyTickers, writeTickersFile };