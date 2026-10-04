import { mkdir, writeFile } from "node:fs/promises";
import "dotenv/config";

import {
  CryptoCvApiError,
  fetchBitcoinNews,
  readArticles,
  unionFields,
} from "./client.js";

import {
  BITCOIN_LIMIT,
  normalizeBitcoinNews,
} from "./bitcoin.normalizer.js";

/**
 * Fetch `/api/bitcoin`, normalize it, and write both to disk in one pass.
 *
 * Run: npx tsx mcp/cryptocurrency.cv/captureBitcoin.ts
 *
 * Out:
 *   mcp/cryptocurrency.cv/raw/bitcoin.json        the raw response
 *   mcp/cryptocurrency.cv/normalized/bitcoin.json  the agent-facing output
 *
 * Self-contained on purpose. `captureRaw.ts` is scoped to repairing the captures
 * that failed during the rate-limit incident, and `/api/bitcoin` is not among
 * them, so it will not regenerate `raw/bitcoin.json` on its own. This script
 * does the whole job for this one endpoint in a single call.
 *
 * Failures are recorded in `raw/` with `ok: false` rather than being swallowed,
 * so a rate-limited run cannot be mistaken for "no Bitcoin news". It does not
 * overwrite `normalized/` in that case - a failed call produces no normalized
 * output, and writing an empty one would look like a real empty result.
 */

const RAW_DIR = "mcp/cryptocurrency.cv/raw";
const OUT_DIR = "mcp/cryptocurrency.cv/normalized";

/** Articles requested. The free tier caps the response at 3. */
const LIMIT = BITCOIN_LIMIT;

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("GET /api/bitcoin  ->  normalize  ->  write");
  console.log("=".repeat(70));
  console.log(`  limit : ${LIMIT}`);

  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const startedAt = Date.now();

  let payload: unknown;

  try {
    payload = await fetchBitcoinNews({ limit: LIMIT });
  } catch (error) {
    const elapsed = Date.now() - startedAt;

    const isApiError = error instanceof CryptoCvApiError;

    const message = error instanceof Error ? error.message : String(error);

    console.log("");
    console.log(`  FAILED ${elapsed}ms`);
    console.log(`  ${message.replace(/\s+/g, " ").slice(0, 220)}`);

    // Record the failure so the state is on disk, but leave `normalized/`
    // untouched: an empty normalized file would read as a real empty result.
    await writeFile(
      `${RAW_DIR}/bitcoin.json`,
      JSON.stringify(
        {
          label: "GET /api/bitcoin",
          capturedAt: new Date().toISOString(),
          elapsedMs: elapsed,
          ok: false,
          params: { limit: LIMIT },
          httpStatus: isApiError ? error.status : null,
          error: message,
        },
        null,
        2,
      ),
      "utf8",
    );

    console.log("");
    console.log(`  raw/bitcoin.json      -> failure recorded`);
    console.log(`  normalized/bitcoin.json -> untouched`);

    process.exitCode = 1;

    return;
  }

  const elapsed = Date.now() - startedAt;

  const articles = readArticles(payload);
  const fields = unionFields(articles);

  console.log(
    `  fetched ${elapsed}ms  ${JSON.stringify(payload).length} chars  ` +
      `articles=${articles.length}  fields=${fields.length}`,
  );

  await writeFile(
    `${RAW_DIR}/bitcoin.json`,
    JSON.stringify(
      {
        label: "GET /api/bitcoin",
        capturedAt: new Date().toISOString(),
        elapsedMs: elapsed,
        params: { limit: LIMIT },
        recordCount: articles.length,
        fieldCount: fields.length,
        fields,
        response: payload,
      },
      null,
      2,
    ),
    "utf8",
  );

  const normalized = normalizeBitcoinNews(payload);

  const json = JSON.stringify(normalized, null, 2);

  await writeFile(`${OUT_DIR}/bitcoin.json`, json, "utf8");

  console.log(`  raw/bitcoin.json         written`);
  console.log(`  normalized/bitcoin.json  written  (${json.length} chars)`);
  console.log("");
  console.log("-".repeat(70));
  console.log(json);
  console.log("-".repeat(70));
  console.log(`  count: ${normalized.count}`);
};

void main().catch((error: unknown) => {
  console.error("");
  console.error("CAPTURE FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});