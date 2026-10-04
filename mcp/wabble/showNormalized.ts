import { mkdir, writeFile } from "node:fs/promises";

import {
  fetchMarketsHeadlines,
  WABBLE_MARKETS_LEVELS,
} from "./wabbleNews.normalizer.js";
import { isWabbleConfigured, WABBLE_MAX_LIMIT } from "./client.js";

/**
 * Print the final agent-facing output of both Wabble markets slices as JSON.
 *
 * Run: npx tsx mcp/wabble/showNormalized.ts
 *
 * Fetches the live API twice - **high first, then medium** - normalizes each,
 * and concatenates.
 *
 * ## Shares its fetcher with the tool
 *
 * This script and `AI/tools/wabbleImportantHeadlineSearch.ts` both call
 * {@link fetchMarketsHeadlines}. That is deliberate: one code path produces both
 * the reviewed output and the tool's live output, so they cannot drift apart.
 * The JSON printed here is exactly what the tool returns.
 *
 * ## High then medium, and why the order matters
 *
 * The two slices do not overlap. Measured 2026-10-04: high returns 5 articles,
 * medium 59, and 5 + 59 = 64, which is the entire unfiltered markets pool. So
 * concatenating them cannot double-count, and `importance` on each item is
 * enough to tell the two apart without carrying the bucket as a field.
 *
 * High goes first because it is the slice a caller actually wants and the
 * small one - if the high fetch fails, the output is visibly short rather than
 * quietly missing its most important articles.
 *
 * ## Writing to `normalized/`
 *
 * Also writes the same JSON to `normalized/wabble.output.json` so the output
 * can be diffed against a later run. That write lives **only** in this script -
 * the normalizer contains no filesystem code at all, so dropping the
 * persistence later is a deletion here and nowhere else.
 *
 * Note the tool does **not** read this file. It calls the live fetcher, so it
 * always reflects the current feed rather than whatever was stored last.
 *
 * Set `WABBLE_NO_WRITE=1` to skip the write while still printing.
 */

const OUT_DIR = "mcp/wabble/normalized";
const OUT_FILE = `${OUT_DIR}/wabble.output.json`;

/** Requested per slice. Both slices fit under it: high 5, medium 59. */
const LIMIT = WABBLE_MAX_LIMIT;

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("WABBLE NORMALIZED OUTPUT");
  console.log("=".repeat(70));
  console.log(`  limit  : ${LIMIT}`);
  console.log(`  levels : ${WABBLE_MARKETS_LEVELS.join(", then ")}`);

  if (!isWabbleConfigured()) {
    console.log("");
    console.log("  WABBLE_API_KEY is not set - nothing to fetch.");

    process.exitCode = 1;

    return;
  }

  try {
    const result = await fetchMarketsHeadlines({ limit: LIMIT });

    console.log("");
    console.log("-".repeat(70));

    result.slices.forEach((slice) => {
      console.log(
        `  ${slice.importance.padEnd(7)} ${String(slice.count).padStart(3)} articles`,
      );
    });

    console.log(`  ${"total".padEnd(7)} ${String(result.count).padStart(3)} articles`);

    // Only the items - the per-slice counts above are reporting, not payload.
    const json = JSON.stringify(result.items, null, 2);

    console.log("");
    console.log(json);

    if (process.env.WABBLE_NO_WRITE === "1") {
      console.log("");
      console.log("  write skipped (WABBLE_NO_WRITE=1)");

      return;
    }

    // ---- write-to-normalized (removable; see header) ----
    await mkdir(OUT_DIR, { recursive: true });

    await writeFile(OUT_FILE, json, "utf8");

    console.log("");
    console.log("=".repeat(70));
    console.log(`  wrote ${OUT_FILE}  (${json.length} chars)`);
    console.log("=".repeat(70));
  } catch (error) {
    console.log("");
    console.log(`  ERROR ${error instanceof Error ? error.message : String(error)}`);

    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error("");

  console.error("PREVIEW FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});