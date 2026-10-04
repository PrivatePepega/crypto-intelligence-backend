import { mkdir, writeFile } from "node:fs/promises";

import {
  describeFinnhubRequest,
  fetchNews,
  isFinnhubConfigured,
  readRecords,
} from "./client.js";

/**
 * Discover the shape of `GET /news?category=crypto`.
 *
 * Run: npx tsx mcp/finnhub/finnhub.test.ts
 *
 * Out: mcp/finnhub/raw/news-crypto.json
 *
 * ## Scope
 *
 * Crypto news only. The other endpoints this API exposes were probed and
 * removed from scope:
 *
 *  - `/news?category=general|forex|merger` - work, but not wanted.
 *  - `/news?category=company` - documented as needing a symbol, but returns a
 *    byte-identical record set to `category=general`, with or without a symbol.
 *    Per-company news is not reachable through this endpoint.
 *  - `/stock/news-sentiment` - returns HTTP 200 with an HTML page, not JSON.
 *  - `/stock/social-sentiment`, `/stock/price-target`,
 *    `/stock/upgrade-downgrade` - HTTP 403 "You don't have access to this
 *    resource", premium tier.
 *  - `/stock/recommendation` - works, but is analyst data rather than news.
 *
 * Those findings live in `README.md` rather than being re-probed each run.
 *
 * ## Rate limiting
 *
 * One request per run, well under the 60/minute limit. No pacing needed at this
 * scope; a {@link GAP_MS} pause is kept in case endpoints are added back.
 */

/** Pause between calls, in milliseconds. Override with `FINNHUB_GAP_MS`. */
const GAP_MS = Number(process.env.FINNHUB_GAP_MS ?? 1500);

/** Articles requested. Note Finnhub ignores this - see the write-up. */
const LIMIT = 5;

const RAW_DIR = "mcp/finnhub/raw";

const TARGETS = [
  {
    slug: "news-crypto",
    label: "GET /news?category=crypto",
    path: "/news?category=crypto",
    params: { category: "crypto", limit: LIMIT },
    call: () => fetchNews({ category: "crypto", limit: LIMIT }),
  },
];

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("FINNHUB CRYPTO NEWS DISCOVERY");
  console.log("=".repeat(70));
  console.log(`  API key : ${isFinnhubConfigured() ? "set" : "NOT SET"}`);
  console.log(`  limit   : ${LIMIT}  (Finnhub ignores this)`);
  console.log(`  endpoints: ${TARGETS.length}`);

  if (!isFinnhubConfigured()) {
    console.log("");
    console.log("  FAIL: set FINNHUB_API_KEY in .env");

    process.exitCode = 1;

    return;
  }

  await mkdir(RAW_DIR, { recursive: true });

  for (const [index, target] of TARGETS.entries()) {
    console.log("");
    console.log(`  ${target.label}`);
    console.log(`    ${describeFinnhubRequest(target.path)}`);

    const startedAt = Date.now();

    try {
      const payload = await target.call();

      const records = readRecords(payload);

      const keys = new Set<string>();

      for (const record of records) {
        for (const key of Object.keys(record)) {
          keys.add(key);
        }
      }

      console.log(
        `    OK ${Date.now() - startedAt}ms  ` +
          `${JSON.stringify(payload).length} chars  records=${records.length}`,
      );

      // Coverage matters more than presence: `summary` is absent on a third of
      // records, which a field list alone would hide.
      for (const key of keys) {
        const present = records.filter(
          (record) => record[key] !== undefined && record[key] !== null && record[key] !== "",
        ).length;

        const sample = records.find((record) => record[key])?.[key];

        const preview =
          typeof sample === "string"
            ? ` ${JSON.stringify(sample.slice(0, 55))}`
            : typeof sample === "number" || typeof sample === "boolean"
              ? ` ${sample}`
              : "";

        console.log(
          `      ${key.padEnd(12)} ${present}/${records.length} populated${preview}`,
        );
      }

      await writeFile(
        `${RAW_DIR}/${target.slug}.json`,
        JSON.stringify(
          {
            label: target.label,
            capturedAt: new Date().toISOString(),
            elapsedMs: Date.now() - startedAt,
            params: target.params,
            recordCount: records.length,
            fields: [...keys],
            response: payload,
          },
          null,
          2,
        ),
        "utf8",
      );

      console.log(`    -> ${RAW_DIR}/${target.slug}.json`);
    } catch (error) {
      console.log(`    FAILED ${(error as Error).message.slice(0, 200)}`);
    }

    if (index < TARGETS.length - 1 && GAP_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    }
  }

  console.log("");
  console.log("=".repeat(70));
};

main().catch((error: unknown) => {
  console.error(error);

  process.exitCode = 1;
});