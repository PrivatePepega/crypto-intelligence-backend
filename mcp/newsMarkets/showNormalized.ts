import { mkdir, writeFile } from "node:fs/promises";

import {
  NEWSMARKETS_IN_SCOPE_SECTIONS,
  NewsMarketsApiError,
} from "./client.js";
import { getSectionNews } from "./fetchers/index.js";

/**
 * Print the final agent-facing output of all four sections as JSON.
 *
 * Run: npx tsx mcp/newsMarkets/showNormalized.ts
 *
 * Calls the live API, so it exercises the whole path - request, normalizer,
 * limit - rather than reading a capture. This is exactly the payload
 * `newsMarketsNewsTool` hands the model: nothing is added, removed or reshaped
 * between here and the tool.
 *
 * Iterates {@link NEWSMARKETS_IN_SCOPE_SECTIONS}, so widening coverage in the
 * client automatically widens this preview and the tool's `category` enum.
 *
 * ## Writing to `normalized/`
 *
 * Also writes the same JSON to `normalized/newsMarkets.output.json` so the
 * output can be diffed against a later run. That write lives **only** in this
 * script - the fetcher and the normalizer contain no filesystem code at all, so
 * dropping the persistence later is a deletion here and nowhere else.
 *
 * Set `NEWSMARKETS_NO_WRITE=1` to skip the write while still printing.
 */

/** Where the combined output is written. */
const OUT_DIR = "mcp/newsMarkets/normalized";
const OUT_FILE = `${OUT_DIR}/newsMarkets.output.json`;

/**
 * Stories requested per section.
 *
 * A review setting, not a production default - the tool owns its own. Set high
 * enough to see truncation happen: `business` returned 40 against a `total` of
 * 42, so a limit of 50 makes the cap visible.
 */
const PREVIEW_LIMIT = 50;

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("NEWSMARKETS NORMALIZED OUTPUT");
  console.log("=".repeat(70));
  console.log(`  preview limit : ${PREVIEW_LIMIT}`);

  const output: Record<string, unknown> = {};
  const summary: string[] = [];

  for (const category of NEWSMARKETS_IN_SCOPE_SECTIONS) {
    try {
      const normalized = await getSectionNews({ category, limit: PREVIEW_LIMIT });

      output[category] = normalized;

      const truncated = normalized.count < normalized.total ? " (capped)" : "";

      summary.push(
        `  ${category.padEnd(9)} total=${String(normalized.total).padEnd(4)}` +
          ` returned=${String(normalized.count).padEnd(4)}${truncated}`,
      );

      console.log(`  ${category.padEnd(9)} ok  ${normalized.count} stories`);
    } catch (error) {
      const isApiError = error instanceof NewsMarketsApiError;

      const message = error instanceof Error ? error.message : String(error);

      console.log(
        `  ${category.padEnd(9)} ${isApiError ? "REFUSED" : "ERROR"} ${message.slice(0, 120)}`,
      );

      output[category] = { error: message };

      process.exitCode = 1;
    }
  }

  console.log("");
  console.log("-".repeat(70));
  summary.forEach((line) => console.log(line));

  const json = JSON.stringify(output, null, 2);

  console.log("");
  console.log(json);

  // ---- write-to-normalized (removable; see header) ----
  if (process.env.NEWSMARKETS_NO_WRITE === "1") {
    console.log("");
    console.log("  write skipped (NEWSMARKETS_NO_WRITE=1)");

    return;
  }

  await mkdir(OUT_DIR, { recursive: true });

  await writeFile(OUT_FILE, json, "utf8");

  console.log("");
  console.log("=".repeat(70));
  console.log(`  wrote ${OUT_FILE}  (${json.length} chars)`);
  console.log("=".repeat(70));
};

main().catch((error: unknown) => {
  console.error("");

  console.error("PREVIEW FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});