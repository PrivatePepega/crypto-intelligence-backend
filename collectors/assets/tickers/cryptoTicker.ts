/**
 * Crypto Ticker Collector
 *
 * Fetches the CoinGecko coins list from:
 *   https://api.coingecko.com/api/v3/coins/list
 *
 * Dumps the raw JSON response into:
 *   collectors/assets/tickers/data/coingecko_coins_list_<timestamp>.json
 *
 * Run with:
 *   npx tsx collectors/assets/tickers/cryptoTicker.ts
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

const COINGECKO_URL = "https://api.coingecko.com/api/v3/coins/list";
const OUTPUT_DIR = path.resolve(process.cwd(), "collectors/assets/tickers/data");

/**
 * Fetch the CoinGecko coins list JSON.
 */
async function fetchCoingeckoCoinsList(): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(COINGECKO_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `CoinGecko request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Write the CoinGecko coins list JSON to a timestamped file.
 */
async function writeCoinsListFile(data: unknown): Promise<string> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `coingecko_coins_list_${timestamp}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);

  await fs.writeFile(filepath, JSON.stringify(data, null, 2) + "\n");
  console.log(`[CRYPTO_TICKER] Wrote ${filepath}`);
  return filepath;
}

async function main(): Promise<void> {
  console.log("[CRYPTO_TICKER] Fetching CoinGecko coins list...");
  const data = await fetchCoingeckoCoinsList();
  const filepath = await writeCoinsListFile(data);
  console.log(`[CRYPTO_TICKER] Done. Output: ${filepath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[CRYPTO_TICKER] Failed:", error);
    process.exitCode = 1;
  });
}

export { fetchCoingeckoCoinsList, writeCoinsListFile };