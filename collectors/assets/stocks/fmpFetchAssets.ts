import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Asset data collector for Financial Modeling Prep (FMP) endpoints.
 *
 * Hits the following FMP endpoints and saves each response as an individual
 * JSON file under `collectors/assets/data/` with `fmp ` prefix:
 *
 *   GET /search-symbol?query=AAPL        → fmp search_symbol_AAPL.json
 *   GET /search-name?query=Apple         → fmp search_name_Apple.json
 *   GET /profile?symbol=AAPL             → fmp profile_AAPL.json
 *   GET /historical-price-eod/light?symbol=AAPL   → fmp historical_price_eod_light_AAPL.json
 *   GET /historical-price-eod/full?symbol=AAPL    → fmp historical_price_eod_full_AAPL.json
 *   GET /stock-list                     → fmp stock_list.json
 *
 * Run with: npx tsx collectors/assets/fmpFetchAssets.ts
 */

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";
const API_KEY = process.env.FMP_API_KEY;

if (!API_KEY) {
  console.error("FMP_API_KEY is not set. Add it to .env to use FMP endpoints.");
  process.exitCode = 1;
}

const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/data");

const SYMBOL = "AAPL";
const QUERY_NAME = "Apple";

async function fetchJson<T>(
  endpoint: string,
  params: Record<string, string>,
): Promise<{ data: T; status: number }> {
  const url = new URL(`${FMP_BASE_URL}${endpoint}`);
  url.searchParams.append("apikey", API_KEY!);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `FMP request failed: ${response.status} ${response.statusText} for ${endpoint}`,
    );
  }

  const data: T = await response.json();
  return { data, status: response.status };
}

async function saveJson(filename: string, data: unknown): Promise<void> {
  const filePath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`  ✓ Wrote ${filePath}`);
}

async function collect(
  endpoint: string,
  params: Record<string, string>,
  filename: string,
): Promise<void> {
  try {
    const { data, status } = await fetchJson<unknown>(endpoint, params);
    await saveJson(`fmp ${filename}`, data);
    console.log(`    Status: ${status}`);
  } catch (error) {
    console.error(`  ✗ Failed to fetch ${endpoint}:`, error);
  }
}

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log(`Fetching asset data for ${SYMBOL}...\n`);

  // 1. Search stocks by ticker symbol
  await collect("/search-symbol", { query: SYMBOL }, `search_symbol_${SYMBOL}.json`);

  // 2. Search by company name
  await collect("/search-name", { query: QUERY_NAME }, `search_name_${QUERY_NAME}.json`);

  // 3. Company profile
  await collect("/profile", { symbol: SYMBOL }, `profile_${SYMBOL}.json`);

  // 4. Historical price EOD - light
  await collect(
    "/historical-price-eod/light",
    { symbol: SYMBOL },
    `historical_price_eod_light_${SYMBOL}.json`,
  );

  // 5. Historical price EOD - full
  await collect(
    "/historical-price-eod/full",
    { symbol: SYMBOL },
    `historical_price_eod_full_${SYMBOL}.json`,
  );

  // 6. Stock list (directory for local search index)
  await collect("/stock-list", {}, "stock_list.json");

  console.log(`\nAsset data collection complete.`);
  console.log(`  Output directory: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error("Asset data collection failed:", error);
  process.exitCode = 1;
});
