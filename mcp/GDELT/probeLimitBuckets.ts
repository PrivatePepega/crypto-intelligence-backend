/**
 * Careful re-test of `limit` on the summarize tools, plus whether the MCP
 * wrapper forwards undeclared parameters at all.
 *
 * The docs say for /events/summary:
 *   "limit - Maximum number of BUCKETS returned (not rows). Default 50, max 500"
 * and that undeclared params should 400 UNKNOWN_PARAM.
 *
 * My earlier probe suggested limit did nothing and an unknown `event_id` was
 * silently accepted. Those two findings are in tension with the docs, so this
 * re-tests both properly - including `search`, which the docs explicitly list
 * as a 400, as a control for "does the MCP layer forward params faithfully".
 *
 * Run: npx tsx mcp/GDELT/probeLimitBuckets.ts
 */
import "dotenv/config";

import {
  fetchSummarizeEvents,
  fetchSummarizeStories,
  fetchSearchEvents,
} from "./fetchers/index.js";
import { closeGdeltClient, readText, readStructured } from "./gdeltClient.js";

const bucketsOf = (structured: unknown): number => {
  const data = (
    structured as { _gdelt?: { payload?: { data?: unknown } } } | undefined
  )?._gdelt?.payload?.data;

  return Array.isArray(data) ? data.length : -1;
};

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(72));
  console.log("A. DOES limit CAP BUCKETS ON summarize_events?");
  console.log("=".repeat(72));
  console.log("  group_by=country, days=7  (a 7-day window has few country buckets)");

  for (const limit of [1, 3, 5, 10, 20, 50]) {
    const result = await fetchSummarizeEvents({
      group_by: "country",
      days: 7,
      limit,
    });

    const n = bucketsOf(readStructured(result));
    console.log(
      `    limit=${String(limit).padEnd(3)} -> ${String(n).padEnd(4)} buckets${n === limit ? "   <-- CAPPED at limit" : ""}`,
    );
  }

  console.log("");
  console.log("=".repeat(72));
  console.log("B. group_by=date, days=30 (many buckets, so a cap is visible)");
  console.log("=".repeat(72));

  for (const limit of [5, 10, 20, 50]) {
    const result = await fetchSummarizeEvents({
      group_by: "date",
      days: 30,
      limit,
    });

    const n = bucketsOf(readStructured(result));
    console.log(
      `    limit=${String(limit).padEnd(3)} -> ${String(n).padEnd(4)} buckets${n === limit ? "   <-- CAPPED at limit" : ""}`,
    );
  }

  console.log("");
  console.log("=".repeat(72));
  console.log("C. same test on summarize_stories");
  console.log("=".repeat(72));

  for (const limit of [3, 10, 20, 50]) {
    const result = await fetchSummarizeStories({
      group_by: "category",
      days: 30,
      limit,
    });

    const n = bucketsOf(readStructured(result));
    console.log(
      `    limit=${String(limit).padEnd(3)} -> ${String(n).padEnd(4)} buckets${n === limit ? "   <-- CAPPED at limit" : ""}`,
    );
  }

  console.log("");
  console.log("=".repeat(72));
  console.log("D. DOES THE MCP LAYER FORWARD PARAMETERS FAITHFULLY?");
  console.log("=".repeat(72));
  console.log("  search is documented as 400 UNSUPPORTED_FILTER on summaries.");

  const withSearch = await fetchSummarizeEvents({
    group_by: "date",
    days: 7,
    ...({ search: "bitcoin" } as Record<string, unknown>),
  });

  console.log("");
  console.log(`    summarize_events + search=bitcoin`);
  console.log(`      isError : ${withSearch.isError === true}`);
  console.log(
    `      message : ${readText(withSearch).split("\n")[0]?.slice(0, 150)}`,
  );

  console.log("");
  console.log("  search_events DOES accept search, so it is the control.");

  const searchOnList = await fetchSearchEvents({
    search: "bitcoin",
    search_mode: "lexical",
    days: 3,
    limit: 1,
  });

  console.log(
    `      isError : ${searchOnList.isError === true}  buckets/records: ${bucketsOf(readStructured(searchOnList))}`,
  );

  console.log("");
  console.log("  cursor is documented as 400 UNSUPPORTED_PARAM on summaries.");

  const withCursor = await fetchSummarizeEvents({
    group_by: "date",
    days: 7,
    ...({ cursor: "abc" } as Record<string, unknown>),
  });

  console.log(`      isError : ${withCursor.isError === true}`);
  console.log(
    `      message : ${readText(withCursor).split("\n")[0]?.slice(0, 150)}`,
  );

  console.log("");
  console.log("=".repeat(72));
  console.log("E. RECONCILIATION: summary total vs list total for one window");
  console.log("=".repeat(72));
  console.log("  docs: 'a summary and a list of the same window reconcile'");

  const summary = await fetchSummarizeEvents({
    group_by: "date",
    days: 7,
    limit: 50,
  });

  const summaryTotal = (
    readStructured(summary) as {
      _gdelt?: { payload?: { data?: { event_count?: number }[] } };
    }
  )?._gdelt?.payload?.data?.reduce(
    (sum, b) => sum + (b?.event_count ?? 0),
    0,
  );

  const list = await fetchSearchEvents({ days: 7, limit: 100 });
  const listTotal = (
    readStructured(list) as {
      _gdelt?: { payload?: { pagination?: { total?: number } } };
    }
  )?._gdelt?.payload?.pagination?.total;

  console.log(`    summarize_events sum(event_count) : ${summaryTotal}`);
  console.log(`    search_events   pagination.total: ${listTotal}`);

  await closeGdeltClient();
};

main().catch((error: unknown) => {
  console.error("FAILED:", error);
  void closeGdeltClient();
});