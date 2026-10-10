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

## `fmp-articles` response shape

Captured 2026-10-03 with `captureRaw.ts`. 43 records across three variants.

### Envelope

`structuredContent` is **absent**. The payload arrives as a single text content
block holding a bare JSON array:

```
structuredContent : undefined
content           : 1 block, type "text"
records           : parsed from content[0].text
```

`readPayloadRecords()` handles this. Every other endpoint honours the
documented `structuredContent.data`.

### Fields

Eight fields, present on **43/43** records — a flat, uniform schema with no
optional fields and no nesting.

| Field | Type | Observed | Notes |
| --- | --- | --- | --- |
| `title` | string | 64–112 chars | never contains HTML |
| `date` | string | always 19 chars | `YYYY-MM-DD HH:mm:ss`, no timezone |
| `content` | string | **1987–3599** chars, avg 2753 | HTML in 43/43 |
| `tickers` | string | 8–12 chars | e.g. `NYSE:JOBY` |
| `image` | string | 79–80 chars | CDN URL |
| `link` | string | 78–103 chars | unique per record — good id candidate |
| `author` | string | 10–15 chars | byline, e.g. `Andrew Wynn` |
| `site` | string | constant | `Financial Modeling Prep` |

Notes for the normalizer:

- **`content` is the whole article as HTML**, not a summary. It runs to ~3600
  characters of `<ul>/<li>/<strong>/<a>` markup, so it needs tag stripping *and*
  truncation before it goes anywhere near an agent's context.
- **No `id` field.** `link` is unique across all 43 records and is the only
  stable identifier available.
- **`tickers` may be comma-separated** for multi-ticker articles — only
  single values were observed, so the normalizer should split defensively.
- **`date` has no timezone or offset.** Normalising it to ISO requires assuming
  one; the upstream value is US/Eastern. Converting as if it were UTC shifts
  every timestamp by hours, and the offset changes with daylight saving.
- Encoding is clean UTF-8. Only `U+2019` and `U+2013` appear.

## Verified parameter behaviour

Measured 2026-10-03, not inferred from docs:

| Param | Works? | Evidence |
| --- | --- | --- |
| `limit` | **yes, capped at 200** | `limit: 3` → 3 records; `limit: 20` → 20; `limit: 500` → **200** |
| `page` | **yes** | `page: 0` → Oct 2 18:00–21:03; `page: 1` → Oct 2 15:02–17:06; `page: 99` → Sep 8 |
| `from_date` | **silently ignored** | `from_date: 2026-10-03` (after all data) still returned Oct 2 records |
| `to_date` | **silently ignored** | `to_date: 2026-10-01` (before all data) still returned Oct 2 records |

**`from_date` and `to_date` are accepted and discarded.** Both date filters are
declared on the `news` tool's schema, and the dispatcher drops them without
erroring — the call succeeds and returns unfiltered data. Worth stating plainly
because a silently dropped parameter looks exactly like "no results in that
window".

Consequences for the tools:

- Do **not** advertise a date filter on these endpoints. It does not work.
- Pagination is the only way to reach history, and `page * limit` is the only
  cursor available.
- Clamp `limit` to 200 in the schema rather than accepting a larger value and
  silently returning less than asked for.

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
| `captureRaw.ts` | Records real responses to `raw/` for inspection |
| `raw/` | Captured `fmp-articles` responses and field-shape report |

### Captures

```bash
npx tsx mcp/fmp/captureRaw.ts
```

Writes, per variant, the full MCP envelope (`.result.json`) and the extracted
records (`.records.json`), plus a combined field-shape report
(`fmp-articles.shape.json`). Each capture records which envelope shape produced
the records, since that differs per endpoint.

`raw/` is regenerated output, not source - safe to delete and re-create.

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