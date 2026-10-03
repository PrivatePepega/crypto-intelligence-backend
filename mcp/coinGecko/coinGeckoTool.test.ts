/**
 * Test CoinGecko's search and discovery endpoints and capture the raw shapes.
 *
 * ## Why only three calls for ~100 endpoints
 *
 * The server exposes two MCP tools, `execute` and `search_docs`. Everything
 * else people read about - `/search`, `/coins/markets`, `/onchain/...` - is an
 * **SDK method**, reachable only by writing code for `execute` to run. So
 * "testing a CoinGecko tool" here means testing an SDK method, and this file
 * covers the three search and discovery ones:
 *
 *   1. `search.get`                 - /search                coins, categories, markets
 *   2. `search.trending.get`        - /search/trending       trending coins/NFTs/categories
 *   3. `onchain.search.pools.get`   - /onchain/search/pools  DEX pool discovery
 *
 * Run: npx tsx mcp/coinGecko/coinGeckoTool.test.ts
 *
 * Out: mcp/coinGecko/raw/<method>.json
 *
 * ## A note on `runCoinGeckoCode`
 *
 * This file uses the client's escape hatch rather than a fixed-code helper.
 * That is the sanctioned use: the code below is hand-written and fixed, the
 * file is a developer script rather than an agent-facing tool, and exploring
 * the SDK surface is precisely what the escape hatch exists for. It should
 * not be copied into an LLM-reachable tool - when these endpoints are needed
 * in production, each should get a named helper with fixed code, exactly like
 * `fetchCoinGeckoSimplePrice`.
 *
 * Every `execute` call spends account credit. This makes three.
 */

import { mkdir, writeFile } from "node:fs/promises";

import { closeCoinGeckoClient, runCoinGeckoCode } from "./client.js";

const RAW_DIR = "mcp/coinGecko/raw";

/**
 * Wraps a call in the `run(client)` function `execute` requires.
 *
 * Fixed strings only - nothing here is generated from input.
 */
const wrap = (body: string): string =>
  `async function run(client) {\n  return await ${body};\n}`;

const CASES: {
  label: string;
  /** File-safe name for the capture. */
  slug: string;
  /** The SDK call, already wrapped. */
  code: string;
  intent: string;
}[] = [
  {
    label: "search.get",
    slug: "search",
    code: wrap(`client.search.get({ query: "bitcoin" })`),
    intent: "Search CoinGecko for coins, categories and markets matching a query.",
  },
  {
    label: "search.trending.get",
    slug: "search-trending",
    code: wrap(`client.search.trending.get()`),
    intent: "Query trending search coins, NFTs and categories in the last 24 hours.",
  },
  {
    label: "onchain.search.pools.get",
    slug: "onchain-search-pools",
    code: wrap(`client.onchain.search.pools.get({ query: "eth" })`),
    intent: "Search onchain pools by token name, symbol or contract address.",
  },
];

/** Coarse type name for a value. */
const typeOf = (value: unknown): string => {
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (value === null) return "null";

  return typeof value;
};

/**
 * Reports the structure of a response without dumping it.
 *
 * For each top-level key: its type and, for arrays, the field names present on
 * the first element. That is what a normalizer needs to know - array lengths
 * alone would hide the shape.
 */
const describeShape = (payload: unknown, indent = "    "): void => {
  if (payload === null || typeof payload !== "object") {
    console.log(`${indent}(scalar) ${typeOf(payload)}`);

    return;
  }

  for (const [key, value] of Object.entries(
    payload as Record<string, unknown>,
  )) {
    const type = typeOf(value);

    console.log(`${indent}${key.padEnd(18)} ${type}`);

    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];

      if (first && typeof first === "object" && !Array.isArray(first)) {
        const fields = Object.keys(first as Record<string, unknown>);

        console.log(
          `${indent}  .[0] fields (${fields.length}): ${fields.join(", ")}`,
        );

        // One level deeper, because trending nests the coin under `item`.
        for (const [nestedKey, nested] of Object.entries(
          first as Record<string, unknown>,
        )) {
          if (nested && typeof nested === "object" && !Array.isArray(nested)) {
            const nestedFields = Object.keys(nested as Record<string, unknown>);

            console.log(
              `${indent}    .${nestedKey} fields (${nestedFields.length}): ${nestedFields.slice(0, 12).join(", ")}`,
            );
          }
        }
      }
    }
  }
};

const main = async (): Promise<void> => {
  await mkdir(RAW_DIR, { recursive: true });

  console.log("");
  console.log("=".repeat(70));
  console.log("COINGECKO SEARCH / DISCOVERY TOOL TEST");
  console.log("=".repeat(70));

  let failed = 0;

  for (const testCase of CASES) {
    console.log("");
    console.log(`-`.repeat(70));
    console.log(`${testCase.label}`);
    console.log(`-`.repeat(70));

    const startedAt = Date.now();

    try {
      const payload = await runCoinGeckoCode(
        testCase.code,
        testCase.intent,
      );

      const elapsed = Date.now() - startedAt;

      console.log(`  OK  ${elapsed}ms, ${JSON.stringify(payload).length} chars`);

      describeShape(payload);

      await writeFile(
        `${RAW_DIR}/${testCase.slug}.json`,
        JSON.stringify(
          {
            method: testCase.label,
            code: testCase.code,
            capturedAt: new Date().toISOString(),
            elapsedMs: elapsed,
            payload,
          },
          null,
          2,
        ),
        "utf8",
      );

      console.log(`  -> ${RAW_DIR}/${testCase.slug}.json`);
    } catch (error) {
      failed += 1;

      console.log(
        `  FAIL  ${(error as Error).message.replace(/\s+/g, " ").slice(0, 300)}`,
      );
    }
  }

  console.log("");
  console.log("=".repeat(70));
  console.log(
    failed === 0
      ? `All ${CASES.length} methods returned data.`
      : `${failed} of ${CASES.length} methods failed.`,
  );
  console.log("=".repeat(70));
};

main()
  .catch((error: unknown) => {
    console.error("");
    console.error("TEST FAILED");
    console.error("----------------------------------------------");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeCoinGeckoClient();
  });