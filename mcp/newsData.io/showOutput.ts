import { mkdir, readFile, writeFile } from "node:fs/promises";

import { normalizeCryptoNews } from "./cryptoNews.normalizer.js";
import { normalizeLatestNews } from "./latestNews.normalizer.js";
import { normalizeMarketNews } from "./marketNews.normalizer.js";

/**
 * Print the final agent-facing output of all three normalizers as JSON.
 *
 * Run: npx tsx mcp/newsData.io/showOutput.ts
 *
 * Reads the captures in `raw/` rather than calling the API, so it is offline
 * and free. Requires `captureRaw.ts` to have been run first.
 *
 * This is the exact payload a tool built on these normalizers would hand the
 * model - nothing is added, removed or reshaped between here and the tool.
 *
 * Writes the same JSON to `normalized/` for reference.
 */

const RAW_DIR = "mcp/newsData.io/raw";
const OUT_DIR = "mcp/newsData.io/normalized";

const CASES = [
  {
    slug: "crypto-news",
    endpoint: "/api/1/crypto",
    normalize: normalizeCryptoNews,
  },
  {
    slug: "latest-news",
    endpoint: "/api/1/latest",
    normalize: normalizeLatestNews,
  },
  {
    slug: "market-news",
    endpoint: "/api/1/market",
    normalize: normalizeMarketNews,
  },
];

const main = async (): Promise<void> => {
  const output: Record<string, unknown> = {};

  for (const testCase of CASES) {
    let capture: unknown;

    try {
      capture = JSON.parse(
        await readFile(`${RAW_DIR}/${testCase.slug}.json`, "utf8"),
      ) as unknown;
    } catch {
      console.error(
        `  FAIL  cannot read ${RAW_DIR}/${testCase.slug}.json - run captureRaw.ts first`,
      );

      process.exitCode = 1;

      return;
    }

    output[testCase.endpoint] = testCase.normalize(capture);
  }

  const json = JSON.stringify(output, null, 2);

  console.log("");
  console.log(json);

  await mkdir(OUT_DIR, { recursive: true });

  await writeFile(`${OUT_DIR}/newsData.output.json`, json, "utf8");

  console.log("");
  console.log("=".repeat(70));
  console.log(`Wrote ${OUT_DIR}/newsData.output.json (${json.length} chars)`);
  console.log("=".repeat(70));
};

void main().catch((error: unknown) => {
  console.error(error);

  process.exitCode = 1;
});