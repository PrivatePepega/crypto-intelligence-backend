/**
 * Commodity Ticker Collector
 *
 * Fetches the Financial Modeling Prep commodities list from:
 *   https://financialmodelingprep.com/stable/commodities-list
 *
 * Dumps the raw JSON response into:
 *   collectors/assets/tickers/data/fmp_commodities_list_<timestamp>.json
 *
 * Run with:
 *   npx tsx collectors/assets/tickers/commodityTicket.ts
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

const FMP_URL = "https://financialmodelingprep.com/stable/commodities-list";
const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/tickers/data");

/**
 * Fetch the FMP commodities list JSON.
 * FMP requires an apikey query parameter.
 */
async function fetchFmpCommoditiesList(): Promise<unknown> {
  const apiKey = process.env.FMP_API_KEY;
  const url = apiKey
    ? `${FMP_URL}?apikey=${apiKey}`
    : FMP_URL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `FMP request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Write the FMP commodities list JSON to a timestamped file.
 */
async function writeCommoditiesListFile(data: unknown): Promise<string> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `fmp_commodities_list_${timestamp}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);

  await fs.writeFile(filepath, JSON.stringify(data, null, 2) + "\n");
  console.log(`[COMMODITY_TICKER] Wrote ${filepath}`);
  return filepath;
}

async function main(): Promise<void> {
  console.log("[COMMODITY_TICKER] Fetching FMP commodities list...");
  const data = await fetchFmpCommoditiesList();
  const filepath = await writeCommoditiesListFile(data);
  console.log(`[COMMODITY_TICKER] Done. Output: ${filepath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[COMMODITY_TICKER] Failed:", error);
    process.exitCode = 1;
  });
}

export { fetchFmpCommoditiesList, writeCommoditiesListFile };