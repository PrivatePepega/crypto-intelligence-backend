import express from "express";
import http from "node:http";

import { closeMcpServer, mountMcpServer, MCP_PATH } from "../mcp/index.js";

/**
 * Integration test for the Express mount.
 *
 * The risky part of the wiring is the body handoff: `express.json()` drains the
 * request stream, so the parsed body has to be passed to the node handler
 * explicitly or the MCP request arrives with an already-consumed body. That is
 * only observable over real HTTP, so this test starts a listener and speaks
 * Streamable HTTP to it.
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

process.env.MARKETAUX_API_KEY = "test-key-not-a-real-token";
// Read by resolveAllowedHosts() at mount time.
process.env.MCP_ALLOWED_HOSTS = "mcp-test.example.com";

const app = express();
app.use(express.json());

mountMcpServer(app);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));

const address = server.address();
const port = typeof address === "object" && address !== null ? address.port : 0;
const base = `http://127.0.0.1:${port}`;

// Streamable HTTP requires clients to accept both media types; the server
// answers 406 otherwise.
const MCP_ACCEPT = "application/json, text/event-stream";
const MCP_HEADERS = {
  "content-type": "application/json",
  accept: MCP_ACCEPT,
};

/**
 * Reads a JSON-RPC payload from either a raw JSON body or an SSE frame.
 *
 * The SDK's default `auto` response mode upgrades to `text/event-stream` when
 * the client advertises it, so a conforming client must handle both.
 */
function parseJsonRpc(body: string, contentType: string | null): unknown {
  if (contentType?.includes("text/event-stream")) {
    const dataLine = body
      .split("\n")
      .find((line) => line.startsWith("data:"));

    if (dataLine === undefined) {
      return {};
    }

    return JSON.parse(dataLine.slice("data:".length).trim());
  }

  return JSON.parse(body);
}

/**
 * Posts with an explicit `Host` header.
 *
 * `fetch` treats `Host` as a forbidden header, so the DNS-rebinding guard can
 * only be exercised over `node:http`.
 */
function postWithHost(
  hostHeader: string,
  payload: unknown,
): Promise<number> {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        path: MCP_PATH,
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: MCP_ACCEPT,
          "content-length": Buffer.byteLength(body),
          Host: hostHeader,
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );

    request.on("error", reject);
    request.end(body);
  });
}

/** Posts one JSON-RPC message and returns the parsed reply. */
async function rpc(
  method: string,
  params: unknown,
  id: number,
): Promise<{ status: number; body: string; json: Record<string, unknown> }> {
  const response = await fetch(`${base}${MCP_PATH}`, {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  const body = await response.text();

  let json: Record<string, unknown> = {};
  try {
    json = parseJsonRpc(body, response.headers.get("content-type")) as Record<
      string,
      unknown
    >;
  } catch {
    // left as {} so the caller's assertion reports the raw body
  }

  return { status: response.status, body, json };
}

try {
  // 1. initialize
  const init = await rpc(
    "initialize",
    {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "http-test", version: "1.0.0" },
    },
    1,
  );

  check(
    "1. initialize answered 200 over HTTP",
    init.status === 200,
    `status=${init.status} body=${init.body.slice(0, 200)}`,
  );

  const serverInfo = (
    init.json.result as { serverInfo?: { name?: string } } | undefined
  )?.serverInfo;

  check(
    "2. initialize returned this backend as the server",
    serverInfo?.name === "crypto-intelligence-backend",
    JSON.stringify(serverInfo),
  );

  // 2. tools/list
  const list = await rpc("tools/list", {}, 2);
  const toolNames = (
    (list.json.result as { tools?: { name?: string }[] } | undefined)?.tools ?? []
  ).map((tool) => tool.name);

  check(
    "3. tools/list returns the namespaced marketaux tool",
    toolNames.includes("marketaux_news_search"),
    `tools=[${toolNames.join(",")}]`,
  );

  // 3. a tool call must reach the tool. The test key is fake, so the call must
  // fail at the upstream API with a Marketaux error. A body-wiring bug would
  // instead surface locally as PARSE_ERROR or a schema rejection.
  const call = await rpc(
    "tools/call",
    { name: "marketaux_news_search", arguments: { search: "bitcoin" } },
    3,
  );

  check(
    "4. tools/call reaches the tool (no body-wiring or schema error)",
    call.body.includes("Marketaux") && !call.body.includes("PARSE_ERROR"),
    call.body.slice(0, 300),
  );

  // 4. GET session operation is classified, not crashed
  const getResponse = await fetch(`${base}${MCP_PATH}`, {
    method: "GET",
    headers: { accept: MCP_ACCEPT },
  });
  const getBody = await getResponse.text();
  check(
    "5. GET session operation handled without a server error",
    getResponse.status < 500,
    `status=${getResponse.status} body=${getBody.slice(0, 200)}`,
  );

  // 5. DNS-rebinding guard. A deployed host that is missing from
  // MCP_ALLOWED_HOSTS gets 403 on every request, so both branches are pinned.
  const initPayload = {
    jsonrpc: "2.0",
    id: 9,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "p", version: "1" },
    },
  };

  check(
    "6. localhost Host allowed by default",
    (await postWithHost(`127.0.0.1:${port}`, initPayload)) === 200,
  );

  check(
    "7. MCP_ALLOWED_HOSTS host allowed",
    (await postWithHost("mcp-test.example.com", initPayload)) === 200,
  );

  check(
    "8. foreign Host rejected (DNS-rebinding protection)",
    (await postWithHost("evil.attacker.com", initPayload)) === 403,
  );
} finally {
  // Close the MCP handler before the listener: leaving SSE streams open during
  // teardown trips a libuv assertion on Windows.
  await closeMcpServer();
  server.close();
}

console.log("");
console.log(
  failures === 0 ? `ALL ${passes} CHECKS PASSED` : `${failures} FAILED / ${passes} passed`,
);

if (failures > 0) {
  process.exit(1);
}
