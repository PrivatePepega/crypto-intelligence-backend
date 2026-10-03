import { readFile } from "node:fs/promises";

import {
  CRYPTO_NEWS_LIMIT,
  normalizeCryptoNews,
} from "./cryptoNews.normalizer.js";
import {
  LATEST_NEWS_LIMIT,
  normalizeLatestNews,
} from "./latestNews.normalizer.js";
import {
  MARKET_NEWS_LIMIT,
  normalizeMarketNews,
} from "./marketNews.normalizer.js";

/**
 * Verify the three normalizers against the captured responses.
 *
 * Run: npx tsx mcp/newsData.io/normalizer.test.ts
 *
 * Reads `raw/*.json` rather than calling the API, so this is offline and free.
 * Requires `captureRaw.ts` to have been run first.
 *
 * Asserts the shape the tools will depend on: exactly `title` and `description`
 * per item, no placeholder text leaking through, and the 5-item cap holding.
 */

const RAW_DIR = "mcp/newsData.io/raw";

const CASES = [
  {
    slug: "crypto-news",
    label: "/crypto",
    limit: CRYPTO_NEWS_LIMIT,
    normalize: normalizeCryptoNews,
  },
  {
    slug: "latest-news",
    label: "/latest",
    limit: LATEST_NEWS_LIMIT,
    normalize: normalizeLatestNews,
  },
  {
    slug: "market-news",
    label: "/market",
    limit: MARKET_NEWS_LIMIT,
    normalize: normalizeMarketNews,
  },
];

/** Text that indicates a plan placeholder leaked into the output. */
const PLACEHOLDER = /ONLY AVAILABLE IN/i;

let failures = 0;

const fail = (message: string): void => {
  failures += 1;

  console.log(`    FAIL  ${message}`);
};

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("NEWSDATA.IO NORMALIZER TEST");
  console.log("=".repeat(70));

  for (const testCase of CASES) {
    console.log("");
    console.log(`-`.repeat(70));
    console.log(`${testCase.label}  (limit ${testCase.limit})`);
    console.log(`-`.repeat(70));

    let capture: unknown;

    try {
      capture = JSON.parse(
        await readFile(`${RAW_DIR}/${testCase.slug}.json`, "utf8"),
      ) as unknown;
    } catch {
      fail(`cannot read ${RAW_DIR}/${testCase.slug}.json - run captureRaw.ts first`);

      continue;
    }

    const output = testCase.normalize(capture);

    // --- shape ---
    const outputKeys = Object.keys(output).sort().join(",");

    if (outputKeys !== "count,items") {
      fail(`output keys are "${outputKeys}", expected "count,items"`);
    }

    // --- limit ---
    if (output.items.length > testCase.limit) {
      fail(`${output.items.length} items exceeds limit ${testCase.limit}`);
    }

    if (output.count !== output.items.length) {
      fail(`count ${output.count} does not match items ${output.items.length}`);
    }

    if (output.items.length === 0) {
      fail("no items returned");
    }

    console.log(`  count : ${output.count}`);

    // --- per-item fields ---
    const unexpected = new Set<string>();
    let placeholderHits = 0;

    for (const item of output.items) {
      for (const key of Object.keys(item)) {
        if (key !== "title" && key !== "description") {
          unexpected.add(key);
        }
      }

      if (typeof item.title !== "string" || item.title === "") {
        fail("an item has an empty or non-string title");
      }

      if (typeof item.description !== "string") {
        fail("an item has a non-string description");
      }

      if (PLACEHOLDER.test(item.title) || PLACEHOLDER.test(item.description)) {
        placeholderHits += 1;
      }
    }

    if (unexpected.size > 0) {
      fail(`unexpected item fields: ${[...unexpected].join(", ")}`);
    }

    if (placeholderHits > 0) {
      fail(`${placeholderHits} item(s) contain plan placeholder text`);
    }

    // --- sizes ---
    const titleLengths = output.items.map((item) => item.title.length);
    const descriptionLengths = output.items.map((item) => item.description.length);

    console.log(
      `  title       : ${Math.min(...titleLengths)}-${Math.max(...titleLengths)} chars`,
    );
    console.log(
      `  description : ${Math.min(...descriptionLengths)}-${Math.max(...descriptionLengths)} chars`,
    );
    console.log(`  payload     : ${JSON.stringify(output).length} chars`);

    console.log("");
    console.log(`  first item:`);
    console.log(`    title: ${output.items[0]?.title}`);
    console.log(
      `    desc : ${String(output.items[0]?.description ?? "").slice(0, 110)}...`,
    );

    if (failures === 0) {
      console.log("");
      console.log("  all checks passed");
    }
  }

  console.log("");
  console.log("=".repeat(70));

  if (failures === 0) {
    console.log("ALL NORMALIZERS OK");
  } else {
    console.log(`${failures} CHECK(S) FAILED`);

    process.exitCode = 1;
  }

  console.log("=".repeat(70));
};

void main().catch((error: unknown) => {
  console.error(error);

  process.exitCode = 1;
});