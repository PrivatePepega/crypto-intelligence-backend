import { mkdir, writeFile } from "node:fs/promises";
import "dotenv/config";

import {
  CryptoCvApiError,
  fetchBitcoinNews,
  fetchBreaking,
  fetchDefiNews,
  fetchSearch,
  fetchTagArticles,
  fetchTrending,
  describeCryptoCvBaseUrl,
  readArticles,
} from "./client.js";

import { normalizeBitcoinNews } from "./bitcoin.normalizer.js";
import { normalizeBreaking } from "./breaking.normalizer.js";
import { normalizeDefiNews } from "./defi.normalizer.js";
import { normalizeSearch } from "./search.normalizer.js";
import { normalizeTagArticles } from "./tagsArticles.normalizer.js";
import { normalizeTrending } from "./trending.normalizer.js";

/**
 * Fetch every scoped endpoint, normalize it, and write the result.
 *
 * Run: npx tsx mcp/cryptocurrency.cv/showOutput.ts
 *
 * Out: mcp/cryptocurrency.cv/normalized/<slug>.json
 *
 * This **calls the live API**. The earlier version of this script read
 * `raw/*.json` and normalized those, which meant it could only ever show data
 * already captured - and with the account rate-limited it mostly showed
 * failures. Fetching here makes the script self-contained: one run produces
 * current output without needing `captureRaw.ts` to have run first.
 *
 * `raw/` is deliberately **not** written. That is `captureRaw.ts`'s job; keeping
 * the two separate means a quick normalisation run never overwrites a good
 * capture.
 *
 * Each endpoint is isolated: one failure is reported and the run continues, so a
 * single rate-limited call cannot blank out the whole report.
 */

/** Articles requested per call. The free tier caps responses at 3. */
const LIMIT = 5;

const OUT_DIR = "mcp/cryptocurrency.cv/normalized";

type Normalized = { count: number; items: unknown[] };

/** Anything a fetch can return, kept untyped until the normalizer narrows it. */
type Payload = unknown;

const write = async (slug: string, value: unknown): Promise<void> => {
  await writeFile(
    `${OUT_DIR}/${slug}.json`,
    JSON.stringify(value, null, 2),
    "utf8",
  );
};

/** How many articles a payload carried before normalization. */
const articleCount = (payload: Payload): number => readArticles(payload).length;

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("cryptocurrency.cv  fetch -> normalize -> normalized/");
  console.log("=".repeat(70));
  console.log(`  base url : ${describeCryptoCvBaseUrl()}`);
  console.log(`  limit    : ${LIMIT}`);
  console.log(`  output   : ${OUT_DIR}/`);

  await mkdir(OUT_DIR, { recursive: true });

  const results: Record<string, unknown> = {};

  const tally = { ok: 0, failed: 0 };

  const failed = (t: { failed: number }): void => {
    t.failed += 1;
  };

  /**
   * Fetches, normalizes and records one endpoint.
   *
   * `dependsOn` lets a later endpoint reuse an earlier payload, which
   * `/api/news/extract` needs since it requires an article URL.
   */
  const step = async (
    slug: string,
    endpoint: string,
    fetchIt: () => Promise<Payload>,
    normalize: (raw: Payload) => Normalized,
  ): Promise<Payload | null> => {
    process.stdout.write(`\n  ${endpoint}\n`);

    const startedAt = Date.now();

    let payload: Payload;

    try {
      payload = await fetchIt();
    } catch (error) {
      failed(tally);
      results[endpoint] = {
        error: (error instanceof Error ? error.message : String(error))
          .replace(/\s+/g, " ")
          .slice(0, 160),
      };

      await write(slug, results[endpoint]);

      console.log(
        `    FAILED ${Date.now() - startedAt}ms  ${JSON.stringify(results[endpoint])}`,
      );

      return null;
    }

    const elapsed = Date.now() - startedAt;

    try {
      const normalized = normalize(payload);

      tally.ok += 1;
      results[endpoint] = normalized;

      await write(slug, normalized);

      console.log(
        `    OK ${elapsed}ms  raw=${articleCount(payload)} articles  ` +
          `-> ${normalized.count} normalized  ` +
          `(${JSON.stringify(normalized).length} chars)`,
      );

      return payload;
    } catch (error) {
      failed(tally);
      results[endpoint] = {
        error: `normalize failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };

      await write(slug, results[endpoint]);

      console.log(`    NORMALIZE FAILED  ${JSON.stringify(results[endpoint])}`);

      return payload;
    }
  };

  // --- trending first: no dependencies, and a different response shape ---

  await step(
    "trending",
    "GET /api/trending",
    () => fetchTrending({ limit: LIMIT }),
    normalizeTrending,
  );

  // --- search: its articles supply the URL that news/extract needs ---

  const searchPayload = await step(
    "search",
    "GET /api/search?q=bitcoin",
    () => fetchSearch({ q: "bitcoin", limit: LIMIT }),
    normalizeSearch,
  );

  await step(
    "bitcoin",
    "GET /api/bitcoin",
    () => fetchBitcoinNews({ limit: LIMIT }),
    normalizeBitcoinNews,
  );

  await step(
    "defi",
    "GET /api/defi",
    () => fetchDefiNews({ limit: LIMIT }),
    normalizeDefiNews,
  );

  await step(
    "breaking",
    "GET /api/breaking",
    () => fetchBreaking({ limit: LIMIT }),
    normalizeBreaking,
  );

  await step(
    "tags-bitcoin",
    "GET /api/tags/bitcoin",
    () => fetchTagArticles("bitcoin", { limit: LIMIT }),
    normalizeTagArticles,
  );

  console.log("");
  console.log("=".repeat(70));
  console.log(JSON.stringify(results, null, 2));
  console.log("=".repeat(70));
  console.log(`  with data : ${tally.ok}`);
  console.log(`  failed    : ${tally.failed}`);
  console.log(`  written   : ${OUT_DIR}/`);
  console.log("=".repeat(70));

  if (tally.ok === 0) {
    process.exitCode = 1;
  }
};

void main().catch((error: unknown) => {
  console.error("");
  console.error("FETCH + NORMALIZE FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  if (error instanceof CryptoCvApiError) {
    console.error(`  status: ${error.status}`);
  }

  process.exitCode = 1;
});