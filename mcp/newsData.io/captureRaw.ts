/**
 * Capture one raw JSON response per NewsData.io endpoint of interest.
 *
 * Run: npx tsx mcp/newsData.io/captureRaw.ts
 *
 * Out: mcp/newsData.io/raw/<endpoint>.json - exactly one file per endpoint.
 *
 * Deliberately not a test: no assertions, no pass/fail, no shape assertions.
 * The point is to record what the API actually returns so a normalizer can be
 * written against real data rather than against documentation. An endpoint the
 * current plan refuses still produces a file, holding the refusal, because
 * knowing what the failure looks like is part of the discovery.
 */

import { mkdir, writeFile } from "node:fs/promises";

import {
  describeNewsDataBaseUrl,
  isNewsDataConfigured,
  newsDataRequest,
  NewsDataApiError,
  type NewsDataParams,
} from "./apiClient.js";

const RAW_DIR = "mcp/newsData.io/raw";

/**
 * Articles requested per endpoint.
 *
 * 5 is the working page size for the news endpoints: it is well under the free
 * plan's cap of 10, and it is the number of records the normalizers are built
 * to return.
 *
 * `/sources` is the exception - it rejects `size` outright (HTTP 422) and
 * always returns its full directory.
 */
const SIZE = 5;

/** Today, used to derive a recent archive window. */
const TODAY = new Date().toISOString().slice(0, 10);

/** Thirty days back, for the archive window. */
const MONTH_AGO = new Date(Date.now() - 30 * 86_400_000)
  .toISOString()
  .slice(0, 10);

/**
 * The endpoints to capture.
 *
 * Only the three this integration uses. `/archive` and the `/count` endpoints
 * are paid-plan only and `/sources` is a publisher directory rather than news,
 * so capturing them would spend credits on responses nothing consumes.
 *
 * Findings from probing the dropped endpoints live in `README.md` rather than
 * being re-probed on every run.
 */
const TARGETS: {
  slug: string;
  label: string;
  path: string;
  params: NewsDataParams;
}[] = [
  {
    slug: "crypto-news",
    label: "Crypto News",
    path: "crypto",
    params: { coin: "btc", language: "en", size: SIZE },
  },
  {
    slug: "latest-news",
    label: "Latest News",
    path: "latest",
    params: { q: "bitcoin", language: "en", size: SIZE },
  },
  {
    slug: "market-news",
    label: "Market News",
    path: "market",
    params: { q: "bitcoin", language: "en", size: SIZE },
  },
];

/** Union of field names across the returned records. */
const unionFields = (results: unknown[]): string[] => {
  const keys = new Set<string>();

  for (const record of results) {
    if (record && typeof record === "object" && !Array.isArray(record)) {
      for (const key of Object.keys(record as Record<string, unknown>)) {
        keys.add(key);
      }
    }
  }

  return [...keys];
};

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("NEWSDATA.IO RAW CAPTURE");
  console.log("=".repeat(70));
  console.log(`  base url : ${describeNewsDataBaseUrl()}`);
  console.log(`  API key  : ${isNewsDataConfigured() ? "set" : "NOT SET"}`);
  console.log(`  size     : ${SIZE}`);
  console.log(`  archive  : ${MONTH_AGO} .. ${TODAY}`);

  if (!isNewsDataConfigured()) {
    console.log("");
    console.log("  FAIL: set NEWSDATA_API_KEY or NEWADATA_IO_API_KEY in .env");

    process.exitCode = 1;

    return;
  }

  await mkdir(RAW_DIR, { recursive: true });

  for (const target of TARGETS) {
    console.log(`\n  ${target.label}  ->  /${target.path}`);
    console.log(`    params: ${JSON.stringify(target.params)}`);

    const startedAt = Date.now();

    try {
      const envelope = await newsDataRequest(target.path, target.params);

      const elapsed = Date.now() - startedAt;

      const records = Array.isArray(envelope.results) ? envelope.results : [];
      const fields = unionFields(records);

      console.log(
        `    OK ${elapsed}ms  ${records.length} record(s)  ` +
          `totalResults=${envelope.totalResults ?? "n/a"}  ` +
          `nextPage=${envelope.nextPage ?? "null"}`,
      );

      console.log(`    fields (${fields.length}): ${fields.join(", ")}`);

      await writeFile(
        `${RAW_DIR}/${target.slug}.json`,
        JSON.stringify(
          {
            label: target.label,
            endpoint: `/api/1/${target.path}`,
            method: "GET",
            params: target.params,
            capturedAt: new Date().toISOString(),
            elapsedMs: elapsed,
            recordCount: records.length,
            fieldCount: fields.length,
            fields,
            response: envelope,
          },
          null,
          2,
        ),
        "utf8",
      );

      console.log(`    -> raw/${target.slug}.json`);
    } catch (error) {
      const elapsed = Date.now() - startedAt;

      const isApiError = error instanceof NewsDataApiError;

      const message = (error as Error).message;

      console.log(`    ${isApiError ? "REFUSED" : "ERROR"} ${elapsed}ms`);
      console.log(`    ${message.replace(/\s+/g, " ").slice(0, 220)}`);

      // Still written to disk. A refusal is part of what the endpoint does on
      // this plan, and a normalizer has to know the difference.
      await writeFile(
        `${RAW_DIR}/${target.slug}.json`,
        JSON.stringify(
          {
            label: target.label,
            endpoint: `/api/1/${target.path}`,
            method: "GET",
            params: target.params,
            capturedAt: new Date().toISOString(),
            elapsedMs: elapsed,
            ok: false,
            httpStatus: isApiError ? error.status : null,
            code: isApiError ? error.code : null,
            error: message,
          },
          null,
          2,
        ),
        "utf8",
      );

      console.log(`    -> raw/${target.slug}.json (refusal recorded)`);
    }
  }

  console.log("");
  console.log("=".repeat(70));
  console.log(`Wrote ${TARGETS.length} file(s) to ${RAW_DIR}/`);
  console.log("=".repeat(70));
};

main().catch((error: unknown) => {
  console.error("");
  console.error("CAPTURE FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});