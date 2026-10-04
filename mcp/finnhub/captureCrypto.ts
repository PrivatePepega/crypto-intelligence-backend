import { mkdir, writeFile } from "node:fs/promises";

import {
  CRYPTO_NEWS_LIMIT,
  getCryptoNews,
} from "./cryptoNews.normalizer.js";

/**
 * Fetch `/news?category=crypto`, normalize it, and write the result.
 *
 * Run: npx tsx mcp/finnhub/captureCrypto.ts
 *
 * Out: mcp/finnhub/normalized/crypto-news.json
 *
 * Self-contained: fetches live, normalizes, writes. Does not touch `raw/`,
 * which is the discovery capture's directory.
 */

const OUT_DIR = "mcp/finnhub/normalized";

/** Articles to return. Finnhub ignores the API-side `limit`, so this is a
 *  client-side cap applied by `getCryptoNews`. */
const LIMIT = CRYPTO_NEWS_LIMIT;

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("GET /news?category=crypto  ->  normalize  ->  normalized/");
  console.log("=".repeat(70));
  console.log(`  limit: ${LIMIT}`);

  await mkdir(OUT_DIR, { recursive: true });

  const startedAt = Date.now();

  const normalized = await getCryptoNews({ limit: LIMIT });

  const elapsed = Date.now() - startedAt;

  const json = JSON.stringify(normalized, null, 2);

  await writeFile(`${OUT_DIR}/crypto-news.json`, json, "utf8");

  const withSummary = normalized.items.filter(
    (item) => item.summary !== null,
  ).length;

  console.log(`  fetched + normalized in ${elapsed}ms`);
  console.log(`  count          : ${normalized.count}`);
  console.log(`  with summary   : ${withSummary}/${normalized.count}`);
  console.log(`  empty summary  : ${normalized.count - withSummary}`);
  console.log(`  written        : ${OUT_DIR}/crypto-news.json (${json.length} chars)`);
  console.log("");
  console.log("-".repeat(70));
  console.log(json);
  console.log("-".repeat(70));
};

main().catch((error: unknown) => {
  console.error("");
  console.error("CAPTURE FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});