# CoinGecko MCP client

Client for **CoinGecko's hosted MCP server**.

```bash
npx tsx mcp/coinGecko/coinGecko.test.ts
```

Exits 0 when the server is reachable and healthy, 1 otherwise. Uses only the
client's fixed-code helpers, so running it is safe — no model-authored code
reaches the sandbox.

## Endpoint

```
https://mcp.api.coingecko.com/mcp
```

Streamable HTTP. Override with `COINGECKO_MCP_URL`.

## `COINGECKO_API_KEY` is not used by this client

CoinGecko publishes two servers that authenticate **differently**:

| Server | Endpoint | Auth |
| --- | --- | --- |
| Free (keyless) | `https://mcp.api.coingecko.com/mcp` | none |
| Pro API | `https://mcp.pro-api.coingecko.com/mcp` | OAuth access token |

The Pro API server does **not** accept an API key. Verified 2026-10-03, every
conventional placement was rejected with
`{"error":"invalid_token","error_description":"..."}`:

| Attempt | Result |
| --- | --- |
| no auth | `Missing or invalid access token` |
| `Authorization: Bearer <key>` | `Invalid access token` |
| `x-cg-pro-api-key: <key>` | `Missing or invalid access token` |
| `x-cg-demo-api-key: <key>` | `Missing or invalid access token` |
| `apikey=<key>` query param | `Missing or invalid access token` |

The documented way to use it is a **browser OAuth flow** ("opens a browser tab
to enter it on first connection"), which cannot complete on a headless server.

So this client targets the keyless server. `COINGECKO_API_KEY` remains valid
for the REST API and for the local `@coingecko/coingecko-mcp` package, but the
keyless MCP server neither needs nor consumes it. `isCoinGeckoConfigured()`
reports whether it is set, for diagnostics only.

## Only two tools, and one runs code

| Tool | Params | Purpose |
| --- | --- | --- |
| `search_docs` | `query`, `language`, `detail` | Look up SDK documentation |
| `execute` | `code`, `intent` | Run TypeScript against the CoinGecko SDK |

This is a fundamentally different shape from FMP's 28 tools. There is no
per-endpoint tool and no `endpoint` enum — reaching the ~100 CoinGecko API
endpoints means writing SDK code, which `execute` interprets server-side.

### `execute` contract

The code must declare a top-level `run(client)` function. `client` is the
pre-authenticated SDK. Anything else is rejected with a helpful message:

```
async function run(client) {
  return await client.simple.price.get({ ids: "bitcoin", vs_currencies: "usd" });
}
```

### The sandbox type-checks

Code is compiled, not just interpreted. Passing an array where the SDK wants a
comma-separated string fails with a real diagnostic:

```
Type 'string[]' is not assignable to type 'string'.
```

That is a genuine safety property — malformed code cannot silently produce
wrong data — and it is why the fixed helpers in `client.ts` were written
against observed behaviour rather than against the REST docs.

### Result envelope

`execute` leaves `structuredContent` **undefined** and returns the payload as a
JSON string in the text block, wrapped in a `result` key:

```
content[0].text === '{"result":{"bitcoin":{"usd":84830}}}'
```

`readExecuteResult()` handles that, and accepts `structuredContent` first in
case CoinGecko populates it later.

## Security: do not pass model-authored code

`execute` evaluates code server-side. This client therefore does **not** expose
a generic passthrough as its primary API:

- The named helpers — `pingCoinGecko`, `getCoinGeckoUsage`,
  `fetchCoinGeckoSimplePrice` — contain **fixed** code. Parameters are
  serialised with `JSON.stringify`, producing a JSON literal that is valid
  TypeScript and correctly escaped, so a value containing quotes, backslashes
  or newlines cannot break out of the generated source. Safe with untrusted
  input.
- `runCoinGeckoCode()` is the only escape hatch. It exists because there is no
  other way to reach the wider API, and because hardcoding ~100 endpoints would
  be unmaintainable — that does not make it safe to wire to an LLM tool.

When new CoinGecko data is needed, add a named helper with fixed code and
JSON-serialised parameters, rather than reaching for the escape hatch.

## Observed quota

`key.get()` on the keyless server reports:

```
plan: "Other"
rate limit: 500 requests/minute
monthly credit: 50,000,000, ~0.96% used
```

The `api_key_*` fields mirror the top-level ones, so the keyless endpoint is
drawing on this account's quota rather than an anonymous pool. Every `execute`
call spends credit.

## Layout

| File | Role |
| --- | --- |
| `client.ts` | Connection, safe helpers, escape hatch, result readers |
| `coinGecko.test.ts` | Ping, quota, live market data |

## Client API

| Export | Purpose |
| --- | --- |
| `getCoinGeckoClient()` | Shared client, connects on first use |
| `closeCoinGeckoClient()` | Close it |
| `listCoinGeckoTools()` | Capability discovery |
| `pingCoinGecko()` | Liveness, fixed code |
| `getCoinGeckoUsage()` | Plan, rate limit, remaining credit, fixed code |
| `fetchCoinGeckoSimplePrice({ ids, vsCurrencies })` | Current prices, fixed code |
| `runCoinGeckoCode(code, intent)` | Escape hatch — read the warning |
| `readExecuteResult(result)` | Payload from the `{"result": ...}` envelope |
| `assertNotError(result)` | Throws on a failed call |
| `describeCoinGeckoEndpoint()` | Endpoint, safe to log |
| `isCoinGeckoConfigured()` | Whether `COINGECKO_API_KEY` is set |

## Licensing

CoinGecko data is subject to their Terms of Service and attribution
requirements. Check before redistributing.