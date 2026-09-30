import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import { marketauxModule } from "../mcp/modules/marketaux.js";
import { MCP_TOOL_MODULES } from "../mcp/registry.js";
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  createMcpServer,
  resolveMcpProviders,
} from "../mcp/server.js";

/**
 * Contract test for the generic MCP server.
 *
 * The real `createMcpServer` is exercised over a linked in-memory transport
 * pair, so these assertions go through actual JSON-RPC rather than inspecting
 * internals.
 */

let failures = 0;
let passes = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passes++;
    console.log(`${label}: PASS`);
  } else {
    failures++;
    console.log(`${label}: FAIL${detail ? ` (${detail})` : ""}`);
  }
}

async function listToolNames(server: McpServer): Promise<string[]> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);

  await client.close();
  await server.close();

  return names;
}

// MARKETAUX_API_KEY must be set before the module graph is imported, because
// provider resolution is memoised on first use.
process.env.MARKETAUX_API_KEY = "test-key-not-a-real-token";

const providers = resolveMcpProviders();

check(
  "1. registry is non-empty",
  MCP_TOOL_MODULES.length > 0,
  `${MCP_TOOL_MODULES.length} modules`,
);

check(
  "2. namespaces are unique",
  new Set(MCP_TOOL_MODULES.map((m) => m.namespace)).size === MCP_TOOL_MODULES.length,
  MCP_TOOL_MODULES.map((m) => m.namespace).join(","),
);

check(
  "3. marketaux enabled when the key is set",
  providers.enabled.includes("marketaux"),
  `enabled=[${providers.enabled.join(",")}] disabled=[${providers.disabled.join(",")}]`,
);

const names = await listToolNames(createMcpServer());

check(
  "4. tool is namespaced per provider",
  names.includes("marketaux_news_search"),
  `tools=[${names.join(",")}]`,
);

check(
  "5. upstream tool name is NOT used (would collide across providers)",
  !names.includes("market_aux_news_search"),
  `tools=[${names.join(",")}]`,
);

check(
  "6. tool names are unique",
  new Set(names).size === names.length,
  `tools=[${names.join(",")}]`,
);

const secondRun = await listToolNames(createMcpServer());
check(
  "7. server is rebuildable per request (factory, not singleton)",
  secondRun.join(",") === names.join(","),
  `${secondRun.join(",")} vs ${names.join(",")}`,
);

const marketauxTool = marketauxModule.create();
check("8. marketaux module builds a tool set", marketauxTool !== null);

// --- missing-credential path -------------------------------------------
// A fresh module object with no key must disable itself rather than throw, so
// one unconfigured provider cannot stop the API server booting.
const previousKey = process.env.MARKETAUX_API_KEY;
delete process.env.MARKETAUX_API_KEY;
let disabledReturnedNull = false;
try {
  disabledReturnedNull = marketauxModule.create() === null;
} catch {
  disabledReturnedNull = false;
}
process.env.MARKETAUX_API_KEY = previousKey;

check(
  "9. missing API key disables the provider instead of throwing",
  disabledReturnedNull,
);

check("10. server identity is set", MCP_SERVER_NAME.length > 0 && MCP_SERVER_VERSION.length > 0);

console.log("");
console.log(failures === 0 ? `ALL ${passes} CHECKS PASSED` : `${failures} FAILED / ${passes} passed`);

if (failures > 0) {
  process.exit(1);
}
