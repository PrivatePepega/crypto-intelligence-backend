import {
  closeCoinGeckoClient,
  describeCoinGeckoEndpoint,
  fetchCoinGeckoSimplePrice,
  getCoinGeckoUsage,
  isCoinGeckoConfigured,
  listCoinGeckoTools,
  pingCoinGecko,
} from "./client.js";

/**
 * Connectivity and capability check for the CoinGecko MCP server.
 *
 * Run: npx tsx mcp/coinGecko/coinGecko.test.ts
 *
 * Exit code is 0 when the server is reachable, 1 when it is not.
 *
 * Uses only the client's fixed-code helpers, so running it is safe: no
 * model-authored code reaches the sandbox.
 *
 * Every `execute` call spends account credit. This makes four.
 */

const heading = (title: string): void => {
  console.log("");
  console.log("=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
};

/** Prints a value compactly, keeping the output readable when it is large. */
const preview = (value: unknown): string => {
  const text = JSON.stringify(value, null, 2) ?? String(value);

  return text.length > 600 ? `${text.slice(0, 600)}\n    ...` : text;
};

const run = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("COINGECKO MCP CLIENT TEST");
  console.log("=".repeat(70));
  console.log(`  endpoint: ${describeCoinGeckoEndpoint()}`);
  console.log(
    `  COINGECKO_API_KEY: ${isCoinGeckoConfigured() ? "set" : "not set"}` +
      " (the keyless MCP server does not use it)",
  );

  let failures = 0;

  // --------------------------------------------------
  // 1. Connect and list tools
  // --------------------------------------------------

  heading("1. CONNECT + tools/list");

  const startedAt = Date.now();

  const tools = await listCoinGeckoTools();

  console.log(`  connected in ${Date.now() - startedAt}ms`);
  console.log(`  ${tools.length} tool(s) exposed`);

  for (const tool of tools) {
    const params = Object.keys(
      (tool.inputSchema as { properties?: object } | undefined)?.properties ?? {},
    );

    console.log(`    ${tool.name.padEnd(16)} params: ${params.join(", ")}`);
  }

  // --------------------------------------------------
  // 2. Ping
  // --------------------------------------------------

  heading("2. ping.get() - liveness");

  try {
    const ping = await pingCoinGecko();

    console.log(`  OK  ${preview(ping)}`);
  } catch (error) {
    failures += 1;

    console.log(`  FAIL  ${(error as Error).message.slice(0, 300)}`);
  }

  // --------------------------------------------------
  // 3. Account usage
  // --------------------------------------------------

  heading("3. key.get() - quota and rate limit");

  try {
    const usage = await getCoinGeckoUsage();

    console.log(`  OK  ${preview(usage)}`);

    const perMinute = usage.rate_limit_request_per_minute;

    const remaining = usage.current_remaining_monthly_calls;

    if (typeof perMinute === "number") {
      console.log(`      rate limit: ${perMinute} requests/minute`);
    }

    if (typeof remaining === "number") {
      const used = usage.current_total_monthly_calls ?? 0;

      const percentUsed =
        usage.monthly_call_credit && usage.monthly_call_credit > 0
          ? ((used / usage.monthly_call_credit) * 100).toFixed(2)
          : null;

      console.log(
        `      monthly credit: ${remaining.toLocaleString()} remaining` +
          (percentUsed ? ` (${percentUsed}% used)` : ""),
      );
    }
  } catch (error) {
    failures += 1;

    console.log(`  FAIL  ${(error as Error).message.slice(0, 300)}`);
  }

  // --------------------------------------------------
  // 4. Real market data
  // --------------------------------------------------

  heading("4. simple.price.get() - live market data");

  try {
    const prices = await fetchCoinGeckoSimplePrice({
      ids: ["bitcoin", "ethereum"],
      vsCurrencies: ["usd"],
    });

    const entries = Object.entries(prices);

    if (entries.length === 0) {
      failures += 1;

      console.log("  FAIL  call succeeded but returned no prices");
    } else {
      console.log(`  OK  ${entries.length} coin(s)`);

      for (const [id, quotes] of entries) {
        console.log(
          `      ${id.padEnd(10)} ${JSON.stringify(quotes)}`,
        );
      }
    }
  } catch (error) {
    failures += 1;

    console.log(`  FAIL  ${(error as Error).message.slice(0, 300)}`);
  }

  // --------------------------------------------------
  // 5. Summary
  // --------------------------------------------------

  heading("5. SUMMARY");

  if (failures === 0) {
    console.log("  Client is functional.");
  } else {
    console.log(`  ${failures} check(s) failed.`);
  }
};

run()
  .catch((error) => {
    console.error("");
    console.error("COINGECKO MCP CLIENT TEST FAILED");
    console.error("----------------------------------------------");
    console.error(error instanceof Error ? error.message : String(error));

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeCoinGeckoClient();
  });