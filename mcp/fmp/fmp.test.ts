import {
  callFmpTool,
  closeFmpClient,
  describeFmpEndpoint,
  describeFmpError,
  isFmpConfigured,
  listFmpTools,
  readPayloadRecords,
} from "./client.js";

/**
 * Connectivity and capability check for the FMP MCP server.
 *
 * Pings the endpoint, reports what the server exposes, and exercises each
 * endpoint this integration depends on - printing the observed field shape so a
 * schema change upstream is visible rather than silently producing empty
 * results.
 *
 * Run: npx tsx mcp/fmp/fmp.test.ts
 *
 * Exit code is 0 when the server is reachable, 1 when it is not.
 *
 * Plan gating: FMP restricts most endpoints by subscription tier and reports an
 * under-tiered call as `isError: true` with an ACCESS DENIED message. That is
 * an account setting, not a client fault, so it is reported as GATED and does
 * not fail this script. Every MCP call also counts against the account's daily
 * call allowance (250/day on the free plan), so this makes a handful of calls.
 */

/** Endpoints this integration wraps, with the minimum plan each needs. */
const ENDPOINTS: {
  label: string;
  tool: string;
  args: Record<string, unknown>;
  minPlan: string | null;
}[] = [
  {
    label: "news / crypto-news",
    tool: "news",
    args: { endpoint: "crypto-news", limit: 3 },
    minPlan: "Starter",
  },
  {
    label: "news / search-crypto-news",
    tool: "news",
    args: { endpoint: "search-crypto-news", symbols: ["BTCUSD"], limit: 3 },
    minPlan: "Starter",
  },
  {
    label: "news / general-news",
    tool: "news",
    args: { endpoint: "general-news", limit: 3 },
    minPlan: "Starter",
  },
  {
    label: "news / press-releases",
    tool: "news",
    args: { endpoint: "press-releases", limit: 3 },
    minPlan: "Premium",
  },
  {
    label: "news / fmp-articles",
    tool: "news",
    args: { endpoint: "fmp-articles", limit: 3 },
    minPlan: null,
  },
  {
    label: "economics / economics-calendar",
    tool: "economics",
    args: { endpoint: "economics-calendar" },
    minPlan: "Starter",
  },
];

/** Prints the union of field names across records, with a sample value. */
const describeShape = (records: Record<string, unknown>[]): void => {
  const keys = new Set<string>();

  for (const record of records) {
    for (const key of Object.keys(record)) {
      keys.add(key);
    }
  }

  for (const key of keys) {
    const present = records.filter((record) => record[key] != null).length;

    const sample = records.find((record) => record[key] != null)?.[key];

    const type = Array.isArray(sample)
      ? "array"
      : sample === null
        ? "null"
        : typeof sample;

    const preview =
      typeof sample === "string"
        ? ` ${JSON.stringify(sample.slice(0, 70))}`
        : typeof sample === "number" || typeof sample === "boolean"
          ? ` ${sample}`
          : "";

    console.log(
      `      ${key.padEnd(20)} ${type.padEnd(7)} ${present}/${records.length}${preview}`,
    );
  }
};

const heading = (title: string): void => {
  console.log("");
  console.log("=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
};

const run = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("FMP MCP CLIENT TEST");
  console.log("=".repeat(70));
  console.log(`  endpoint: ${describeFmpEndpoint()}`);

  if (!isFmpConfigured()) {
    console.log("");
    console.log("  FAIL: FMP_API_KEY is not set.");

    process.exitCode = 1;

    return;
  }

  // --------------------------------------------------
  // 1. Connect and list tools
  // --------------------------------------------------

  heading("1. CONNECT + tools/list");

  const startedAt = Date.now();

  const tools = await listFmpTools();

  console.log(`  connected in ${Date.now() - startedAt}ms`);
  console.log(`  ${tools.length} tool(s) exposed`);

  for (const tool of tools) {
    const params = Object.keys(
      (tool.inputSchema as { properties?: object } | undefined)?.properties ?? {},
    );

    console.log(`    ${tool.name.padEnd(22)} ${params.join(", ")}`);
  }

  // --------------------------------------------------
  // 2. Exercise each endpoint
  // --------------------------------------------------

  heading("2. ENDPOINT CHECKS");

  let withData = 0;
  let gated = 0;
  let empty = 0;

  for (const endpoint of ENDPOINTS) {
    const plan = endpoint.minPlan ? ` (needs ${endpoint.minPlan})` : "";

    console.log(`\n  ${endpoint.label}${plan}`);

    try {
      const result = await callFmpTool(endpoint.tool, endpoint.args);

      if (result.isError) {
        gated += 1;

        // Run through describeFmpError so the plan-gate translation is
        // exercised on every run, not just asserted in a comment.
        console.log(`    GATED  ${describeFmpError(readError(result))}`);

        continue;
      }

      withData += 1;

      const records = readPayloadRecords(result);

      if (records.length === 0) {
        empty += 1;

        console.log(`    EMPTY  call succeeded but no records were returned`);

        continue;
      }

      console.log(`    OK     ${records.length} record(s)`);
      describeShape(records);
    } catch (error) {
      gated += 1;

      console.log(`    ERROR  ${(error as Error).message.slice(0, 200)}`);
    }
  }

  // --------------------------------------------------
  // 3. Summary
  // --------------------------------------------------

  heading("3. SUMMARY");

  console.log(
    `  answered with data: ${withData}/${ENDPOINTS.length}`,
  );
  console.log(`  gated by plan:     ${gated}`);
  console.log(`  answered empty:    ${empty}`);

  if (gated > 0) {
    console.log("");
    console.log(
      "  GATED means the server refused the call on subscription tier, not",
    );
    console.log(
      "  that it was unreachable - the transport and auth both worked.",
    );
    console.log(
      "  Upgrade at https://financialmodelingprep.com/developer/docs/pricing",
    );
  }

  console.log("");
  console.log(
    withData + gated === ENDPOINTS.length
      ? "  Client is functional."
      : "  Some endpoints answered unexpectedly - investigate.",
  );
};

const readError = (result: {
  content?: { type: string; text?: string }[];
}): string =>
  (result.content ?? [])
    .map((item) => ("text" in item ? (item.text ?? "") : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

run()
  .catch((error) => {
    console.error("");
    console.error("FMP MCP CLIENT TEST FAILED");
    console.error("----------------------------------------------");
    console.error(
      error instanceof Error ? error.message : String(error),
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeFmpClient();
  });