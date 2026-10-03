# FMP MCP client

Client for **Financial Modeling Prep's official hosted MCP server**.

```bash
npx tsx mcp/fmp/fmp.test.ts
```

Exits 0 when the server is reachable, 1 when it is not.

## Endpoint

FMP publishes one remote Streamable HTTP MCP endpoint that wraps its entire
REST API. There is no SDK and no second base URL.

```
https://financialmodelingprep.com/mcp?apikey=YOUR_FMP_API_KEY
```

Auth is an `apikey` **query parameter**, not a header. Override the base with
`FMP_MCP_URL` to point at a mock.

Verified against the live server on 2026-10-03: handshake in ~730ms, 28 tools
exposed.

## Two behaviours that shape the client

### 1. Tools are multiplexed by an `endpoint` enum

28 tool names, but each covers a whole product family. Every news feed is the
*same* `news` tool, discriminated only by `endpoint`:

| Feature | Tool | `endpoint` |
| --- | --- | --- |
| Crypto news | `news` | `crypto-news` |
| Search crypto news | `news` | `search-crypto-news` |
| General news | `news` | `general-news` |
| Press releases | `news` | `press-releases` |
| FMP articles | `news` | `fmp-articles` |
| Economic calendar | `economics` | `economics-calendar` |

Full `news` enum: `crypto-news`, `fmp-articles`, `forex-news`, `general-news`,
`press-releases`, `search-crypto-news`, `search-forex-news`,
`search-press-releases`, `search-stock-news`, `stock-news`.

Full `economics` enum: `economics-calendar`, `economics-indicators`,
`market-risk-premium`, `treasury-rates`.

Callers should pin `endpoint` per feature rather than pass it through from the
outside, so one feature cannot reach another's endpoint.

### 2. Result envelopes are inconsistent

The documented shape is `structuredContent = { data: [...] }` and most
endpoints honour it. **`fmp-articles` does not** - it returns an empty
`structuredContent` and puts a bare JSON array in the first text content block.

`readPayloadRecords()` accepts all three observed shapes, in order:

1. `structuredContent.data`
2. `structuredContent` (bare array)
3. text content block (bare JSON array, or `{ data: [...] }`)

Getting this wrong is silent: the wrong path yields `[]` with no error, which
is indistinguishable from "no results".

## Plan gating

FMP restricts endpoints by subscription tier and answers an under-tiered call
with `isError: true` and an `ACCESS DENIED ... requires the ... plan` message.
That is a **200-class refusal over a working transport**, so it is easy to
misread as an outage.

| Feature | Minimum plan |
| --- | --- |
| `fmp-articles` | none (available on the free plan) |
| `crypto-news`, `search-crypto-news`, `general-news` | Starter |
| `economics-calendar` | Starter |
| `press-releases` | Premium |

Plans: Basic (free, 250 calls/day) → Starter ($19-29/mo) → Premium
($49-69/mo) → Ultimate ($99-149/mo). Every MCP call counts against the same
daily allowance as the REST API.

`describeFmpError()` rewrites the refusal into an actionable message naming the
tier and the upgrade link, so an agent does not retry a call that cannot
succeed.

**Current state:** on the configured key, 1 of the 6 endpoints above returns
data and 5 are gated. The client itself is working - the server is refusing on
subscription tier.

## Layout

| File | Role |
| --- | --- |
| `client.ts` | Connection, tool invocation, result readers |
| `fmp.test.ts` | Ping, capability dump, per-endpoint checks |

## Client API

| Export | Purpose |
| --- | --- |
| `getFmpClient()` | Shared client, connects on first use |
| `closeFmpClient()` | Close it |
| `callFmpTool(name, args, signal?)` | Raw call; does not throw on `isError` |
| `listFmpTools()` | Capability discovery |
| `readPayloadRecords(result)` | Records from any envelope shape |
| `assertNotError(result)` | Throws on a failed call |
| `describeFmpError(message)` | Plan-gate message made actionable |
| `isFmpConfigured()` | Whether a key is present |
| `describeFmpEndpoint()` | URL with the key redacted, safe to log |

`callFmpTool` deliberately does not throw on `isError`, because FMP reports
transport problems and plan-gating identically and callers usually want to
tell those apart. Pair it with `assertNotError` once that distinction is made.

## Note on third-party FMP "MCP servers"

Search results surface several community servers (`@houtini/fmp-mcp`,
`daxm/fmpsdk-mcp`, `imbenrabi/Financial-Modeling-Prep-MCP-Server`). Those are
**local stdio wrappers around FMP's REST API**, unrelated to the hosted server
used here. They have different tool counts, different auth, and different rate
limits. Do not use them as a reference for this client.

## Licensing

FMP data is subject to their Terms of Service. Displaying or redistributing it
requires a Data Display and Licensing Agreement.