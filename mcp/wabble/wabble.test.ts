import { mkdir, writeFile } from "node:fs/promises";

import {
  fetchNews,
  isWabbleConfigured,
  WABBLE_ACCOUNT_CATEGORIES,
  WABBLE_ADVISED_DELAY_SECONDS,
  WABBLE_MAX_LIMIT,
  wabbleAbsoluteUrl,
  WabbleApiError,
  type WabbleImportance,
} from "./client.js";

/**
 * Capture the two Wabble markets slices this integration uses.
 *
 * Run: npx tsx mcp/wabble/wabble.test.ts
 *
 * Out: mcp/wabble/raw/markets-<importance>.json
 *
 * ## Scope
 *
 * Two requests, both in the `markets` lane - the only category the free plan
 * allows:
 *
 *   markets + importance=high      5 articles
 *   markets + importance=medium   59 articles
 *
 * `importance=low` was measured at **0 articles**, so it is not captured.
 * Removing the rest of the original sweep:
 *
 *  - `q-*` (11 queries x 2 lanes) - every query returned **0** results at
 *    `importance=high`, and only 5 of 11 matched the wider pool. `q` is not
 *    carried forward.
 *  - `markets-all` - the unfiltered 64-article pool. Redundant against the two
 *    slices below.
 *  - `markets-low` - empty.
 *  - three guard probes for the 403 category gate and two 400 validation
 *    errors. The behaviour they recorded is documented in `client.ts`; the
 *    payloads are not needed.
 *
 * ## The slices do not overlap
 *
 * 5 + 59 = 64, matching the unfiltered pool exactly, so an article appears in
 * one slice or the other and never both. That makes them safe to concatenate.
 *
 * ## Pacing
 *
 * A {@link GAP_MS} pause separates the two calls. The envelope advertises
 * `delay_seconds: 120`, but that is a plan term rather than an enforced
 * throttle - roughly 26 requests fired under 3s apart during exploration all
 * returned `200`, with no `429`.
 *
 * Set `WABBLE_GAP_MS=120000` to honour the plan's stated cadence exactly.
 *
 * ## Not a test
 *
 * No assertions. The purpose is to capture real payloads so the fields worth
 * normalizing can be chosen from data. A failed call still writes a file.
 */

/** Pause between calls, in milliseconds. Override with `WABBLE_GAP_MS`. */
const GAP_MS = Number(process.env.WABBLE_GAP_MS ?? 3000);

const RAW_DIR = "mcp/wabble/raw";

/**
 * Importance levels captured, in request order.
 *
 * High first: it is the slice a caller actually wants, and it is the small
 * one, so seeing it succeed first makes a failure obvious.
 */
const LEVELS: WabbleImportance[] = ["high", "medium"];

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("WABBLE MARKETS DISCOVERY");
  console.log("=".repeat(70));
  console.log(`  configured  : ${isWabbleConfigured()}`);
  console.log(`  gap         : ${GAP_MS}ms`);
  console.log(
    `  advised gap : ${WABBLE_ADVISED_DELAY_SECONDS}s (plan term, not enforced)`,
  );
  console.log(`  categories  : ${WABBLE_ACCOUNT_CATEGORIES.join(", ")} (free plan)`);
  console.log(`  levels      : ${LEVELS.join(", ")}`);

  if (!isWabbleConfigured()) {
    console.log("");
    console.log("  WABBLE_API_KEY is not set - nothing to probe.");

    process.exitCode = 1;

    return;
  }

  await mkdir(RAW_DIR, { recursive: true });

  let ok = 0;
  let failed = 0;

  for (const [index, importance] of LEVELS.entries()) {
    console.log("");
    console.log(`  markets, importance=${importance}, limit=${WABBLE_MAX_LIMIT}`);

    const startedAt = Date.now();

    try {
      const response = await fetchNews({
        categories: WABBLE_ACCOUNT_CATEGORIES.join(","),
        importance,
        limit: WABBLE_MAX_LIMIT,
      });

      const elapsed = Date.now() - startedAt;

      ok += 1;

      const withExcerpt = response.data.filter(
        (item) => item.excerpt.trim() !== "",
      ).length;

      console.log(
        `    OK ${elapsed}ms  ${response.count} articles  ` +
          `excerpt ${withExcerpt}/${response.count}`,
      );
      console.log(
        `    quota: plan=${response.quota.plan} ` +
          `remaining=${response.quota.remaining}/${response.quota.weeklyLimit}`,
      );

      // `noUncheckedIndexedAccess` makes the index `| undefined` regardless of
      // the length check, so it is defaulted rather than guarded.
      const first = response.data[0];

      if (first) {
        console.log(
          `    newest: ${first.publishedAt ?? "?"} ${first.headline.slice(0, 70)}`,
        );
      }

      console.log(`    cursor: ${response.nextCursor ?? "none"}`);

      await writeFile(
        `${RAW_DIR}/markets-${importance}.json`,
        JSON.stringify(
          {
            label: `markets, importance=${importance}`,
            importance,
            capturedAt: new Date().toISOString(),
            elapsedMs: elapsed,
            count: response.count,
            quota: response.quota,
            nextCursor: response.nextCursor,
            response: {
              ok: response.ok,
              count: response.count,
              language: response.language,
              request_id: response.requestId,
              next_cursor: response.nextCursor,
              archive: response.quota.archive,
              data: response.data.map((item) => ({
                ...item,
                // Both forms kept: the relative path is what the API returned,
                // the absolute one is what a caller would need. Capture-only -
                // no normalizer does this.
                imageUrlAbsolute: wabbleAbsoluteUrl(item.imageUrl),
              })),
            },
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch (error) {
      failed += 1;

      const isApiError = error instanceof WabbleApiError;

      const message = error instanceof Error ? error.message : String(error);

      console.log(
        `    ${isApiError ? `HTTP ${error.status}` : "ERROR"} ${Date.now() - startedAt}ms`,
      );
      console.log(`      ${message.replace(/\s+/g, " ").slice(0, 220)}`);

      await writeFile(
        `${RAW_DIR}/markets-${importance}.json`,
        JSON.stringify(
          {
            label: `markets, importance=${importance}`,
            importance,
            capturedAt: new Date().toISOString(),
            ok: false,
            status: isApiError ? error.status : null,
            error: message,
          },
          null,
          2,
        ),
        "utf8",
      );
    }

    if (index < LEVELS.length - 1 && GAP_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    }
  }

  console.log("");
  console.log("=".repeat(70));
  console.log(`  requests : ${LEVELS.length}`);
  console.log(`  ok       : ${ok}`);
  console.log(`  failed   : ${failed}`);
  console.log(`  captures : ${RAW_DIR}/`);
  console.log("=".repeat(70));
};

main().catch((error: unknown) => {
  console.error("");
  console.error("DISCOVERY FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});