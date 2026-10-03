import { mkdir, writeFile } from "node:fs/promises";

import {
  describeNewsDataBaseUrl,
  fetchCryptoNews,
  fetchLatestNews,
  fetchMarketNews,
  isNewsDataConfigured,
  NewsDataApiError,
  type NewsDataParams,
} from "./apiClient.js";

/**
 * Probe the three NewsData.io endpoints this integration uses.
 *
 * Run: npx tsx mcp/newsData.io/apiEndpoints.test.ts
 *
 * Out: mcp/newsData.io/raw/api/<endpoint>.json
 *
 * Scope is deliberately limited to `/crypto`, `/latest` and `/market`. The API
 * also exposes `/archive`, `/sources` and three `/count` endpoints, but they are
 * not used: `/archive` and the counts are paid-plan only, and `/sources` is a
 * publisher directory rather than news.
 *
 * Captures the full response plus a field report recording what is actually
 * present. The difference from the documented schema matters, because seven
 * fields return plan-gated placeholder strings rather than data.
 */

const RAW_DIR = "mcp/newsData.io/raw/api";

/** Articles requested per endpoint. Under the free plan's cap of 10. */
const SIZE = 5;

/** Fields that return a placeholder string instead of data on lower plans. */
const GATED_PATTERN = /ONLY AVAILABLE IN/i;

/** Coarse type name for a value. */
const typeOf = (value: unknown): string => {
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (value === null) return "null";

  return typeof value;
};

/**
 * Reports the structure of an article without dumping the content.
 *
 * Presence across all records matters more than one sample: a field can be
 * present on one article and absent on the next.
 */
const describeArticles = (
  articles: Record<string, unknown>[],
): void => {
  const keys = new Set<string>();

  for (const article of articles) {
    for (const key of Object.keys(article)) {
      keys.add(key);
    }
  }

  console.log(`      ${articles.length} article(s), ${keys.size} distinct fields`);

  for (const key of keys) {
    const values = articles.map((article) => article[key]);

    const present = values.filter(
      (value) => value !== undefined && value !== null && value !== "",
    );

    const sample = present[0];

    const gated =
      typeof sample === "string" && GATED_PATTERN.test(sample)
        ? "  GATED PLACEHOLDER"
        : "";

    console.log(
      `      ${key.padEnd(16)} ${typeOf(sample).padEnd(12)} ${present.length}/${articles.length}${gated}`,
    );
  }
};

const heading = (title: string): void => {
  console.log("");
  console.log("=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
};

const CASES: {
  slug: string;
  label: string;
  params: NewsDataParams;
  call: () => Promise<{
    results?: unknown;
    totalResults?: number;
    nextPage?: string | null;
  }>;
}[] = [
  {
    slug: "latest",
    label: "GET /latest",
    params: { q: "bitcoin", language: "en", size: SIZE },
    call: () => fetchLatestNews({ q: "bitcoin", language: "en", size: SIZE }),
  },
  {
    slug: "crypto",
    label: "GET /crypto",
    params: { coin: "btc", language: "en", size: SIZE },
    call: () => fetchCryptoNews({ coin: "btc", language: "en", size: SIZE }),
  },
  {
    slug: "market",
    label: "GET /market",
    params: { q: "bitcoin", language: "en", size: SIZE },
    call: () => fetchMarketNews({ q: "bitcoin", language: "en", size: SIZE }),
  },
];

const run = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("NEWSDATA.IO REST API - ENDPOINT DISCOVERY");
  console.log("=".repeat(70));
  console.log(`  base url : ${describeNewsDataBaseUrl()}`);
  console.log(`  API key  : ${isNewsDataConfigured() ? "set" : "NOT SET"}`);
  console.log(`  size     : ${SIZE}`);
  console.log(`  endpoints: ${CASES.length}`);

  if (!isNewsDataConfigured()) {
    console.log("");
    console.log("  FAIL: set NEWSDATA_API_KEY or NEWADATA_IO_API_KEY in .env");

    process.exitCode = 1;

    return;
  }

  await mkdir(RAW_DIR, { recursive: true });

  const report: Record<string, unknown>[] = [];

  let worked = 0;
  let failed = 0;

  for (const testCase of CASES) {
    console.log(`\n  ${testCase.label}`);
    console.log(`    params: ${JSON.stringify(testCase.params)}`);

    const startedAt = Date.now();

    try {
      const envelope = await testCase.call();

      const elapsed = Date.now() - startedAt;

      const articles = Array.isArray(envelope.results)
        ? (envelope.results as Record<string, unknown>[])
        : [];

      worked += 1;

      console.log(
        `    OK ${elapsed}ms  totalResults=${envelope.totalResults ?? "?"}  ` +
          `returned=${articles.length}  nextPage=${envelope.nextPage ?? "null"}`,
      );

      if (articles.length > 0) {
        describeArticles(articles);

        const firstTitle = articles[0]?.title ?? "";

        console.log(`      first title: ${JSON.stringify(String(firstTitle).slice(0, 90))}`);
      }

      report.push({
        endpoint: testCase.label,
        ok: true,
        elapsedMs: elapsed,
        params: testCase.params,
        totalResults: envelope.totalResults,
        returned: articles.length,
        fields: Object.keys(articles[0] ?? {}),
      });

      await writeFile(
        `${RAW_DIR}/${testCase.slug}.json`,
        JSON.stringify(
          {
            endpoint: testCase.label,
            capturedAt: new Date().toISOString(),
            elapsedMs: elapsed,
            params: testCase.params,
            totalResults: envelope.totalResults,
            nextPage: envelope.nextPage,
            payload: envelope,
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch (error) {
      failed += 1;

      const isApiError = error instanceof NewsDataApiError;

      const message = (error as Error).message.replace(/\s+/g, " ").slice(0, 190);

      console.log(`    ${isApiError ? "REFUSED" : "ERROR"} ${message}`);

      report.push({
        endpoint: testCase.label,
        ok: false,
        params: testCase.params,
        httpStatus: isApiError ? error.status : undefined,
        error: message,
      });
    }
  }

  heading("SUMMARY");

  console.log(`  endpoints probed : ${report.length}`);
  console.log(`  returned data    : ${worked}`);
  console.log(`  refused / failed : ${failed}`);
  console.log("");
  console.log(`  Captures written to ${RAW_DIR}/`);

  await writeFile(
    `${RAW_DIR}/_report.json`,
    JSON.stringify(
      { capturedAt: new Date().toISOString(), size: SIZE, report },
      null,
      2,
    ),
    "utf8",
  );
};

run().catch((error: unknown) => {
  console.error("");
  console.error("API DISCOVERY FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});