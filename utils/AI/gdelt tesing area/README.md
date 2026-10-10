# GDELT DOC 2.0 - discovery and testing area

Scratch area for evaluating the GDELT Project's public DOC 2.0 API before any of it
is wired into `mcp/` or registered as an agent tool.

**Nothing here is production code.** It lives outside the provider tree on purpose:
the endpoint has not been characterised yet, and a half-verified integration is
worse than none.

Run order and current status: [Findings](#findings) · [Unverified](#what-is-still-unverified)

---

## What is here

| File                              | Role                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `api/gdeltClient.ts`              | REST client. Serialised queue, 429 retry, non-JSON guard, parameter validation. |
| `api/gdeltClient.test.ts`         | 34 assertions against a **local** server. No GDELT quota.                       |
| `api/gdelt.categories.ts`         | The 22 curated categories from the brief, as a separate registry.               |
| `api/capture.ts`                  | Probe-only: saves responses, summarises shapes.                                 |
| `api/probe04-raw-sweep.ts`        | Walks all 7 modes, 8s apart, saving verbatim bodies.                            |
| `api/probe05-analyse-captures.ts` | Analyses saved captures. No network cost.                                       |
| `api/probe-one.ts`                | One question, one request. The main probing tool from here.                     |
| `api/probe00`–`probe03`           | The discovery probes already run.                                               |
| `raw output/`                     | Every response received, success or failure.                                    |

```bash
npx tsx "utils/AI/gdelt tesing area/api/gdeltClient.test.ts"

npx tsx "utils/AI/gdelt tesing area/api/probe-one.ts" --mode=artlist --query=bitcoin --maxrecords=5 --cooldown=300000
```

---

## Findings

### Confirmed against the live endpoint

**1. No API key is required.** Unauthenticated requests succeed. The v1 endpoints
needed `GDELT_API_KEY`; DOC 2.0 does not. The client sends no credentials.

**2. Error responses are plain text, not JSON.** HTTP 429 arrives with **no
`Content-Type` header** and a 444-byte text body:

```
Please limit requests to one every 5 seconds or contact kalev.leetaru5@gmail.com ...
```

Any client that assumes a JSON error envelope will fail confusingly here. The
client preserves this text on `GdeltApiError.body` because it is the only
explanation available.

**3. An empty result is HTTP 200 with a literal `{}`.** Two bytes, no `articles`
key. This is the most dangerous behaviour found, because it is indistinguishable
from success:

```json
{}
```

A normalizer that reads `payload.articles ?? []` would report "no coverage" when
the truth is "your parameters were rejected". **This must be surfaced as an
explicit empty, never defaulted into a fabricated shape.** Covered by test
section 2.

**4. Latency is 8-26 seconds per request.** Measured across ~15 calls. This is
the constraint that shapes the tooling.

**5. `timelinevol` response shape.**

```json
{
  "query_details": { "title": "bitcoin", "date_resolution": "day" },
  "timeline": [
    { "series": "Volume Intensity", "data": [{ "date": "20260718T000000Z", "value": 0.0901 }] }
  ]
}
```

Note that with **no time parameter** it returns the full rolling ~3-month window,
not a recent slice. Every agent call must set a window explicitly or pay for
three months of timeline.

**6. `timelinelang` works, and is a payload trap.**

```
25 series x 73 points = 84,063 bytes for a single unbounded query
```

Series are named `"<Language> Volume Intensity"` — Bulgarian, Norwegian, Korean
and so on. There is **no machine-readable language field**; the name is the only
identifier, so a consumer must parse it and must not assume a fixed set of 25.

**7. Timeline days are omitted, not zero-filled.** Verified against the captured
`timelinevol` body: 73 points span 85 calendar days, with 12 days missing.

```
20260913 -> 20260920  (+6 absent)
20260925 -> 20260927  (+1)
20261002 -> 20261006  (+3)
20261006 -> 20261008  (+1)
20261008 -> 20261010  (+1)
```

A normalizer that assumes one point per day will place every date after a gap on
the wrong day. **Absent day and an explicit `0` are different things** — the last
two points here are real zeros (`20261008`, `20261010`), not missing data.

**8. GDELT's compact timestamps are not `Date`-parseable.** `Date.parse("20260913Z")`
returns `Invalid Date`, and every comparison against `NaN` is `false`. A
gap-detection loop written the obvious way reports a gapped series as contiguous —
it did exactly that here before it was caught. Parse
`YYYYMMDDTHHMMSSZ` explicitly.

### Sweep results

Run at 8-second spacing, all 7 modes, one request each
(`api/probe04-raw-sweep.ts`):

| mode                    | status  | ms    | bytes | outcome                   |
| ----------------------- | ------- | ----- | ----- | ------------------------- |
| `artlist`               | 429     | 9467  | 444   | rate limited              |
| `timelinevol`           | **200** | 12172 | 3610  | 1 series, 73 points       |
| `timelinevolraw`        | 429     | 9456  | 444   | rate limited              |
| `timelinevolinfo`       | 429     | 9521  | 444   | rate limited              |
| `timelinetone`          | 429     | 10372 | 444   | rate limited              |
| `timelinelang`          | **200** | 11843 | 84063 | 25 series, 73 points each |
| `timelinesourcecountry` | 429     | 11801 | 444   | rate limited              |

**2 of 7 returned data.** Both successes are the cheapest responses (3.6 KB and
84 KB), and both were timeline modes. Every `artlist` attempt across this entire
session — some 8 separate tries — returned either 429 or an empty `{}`.

Verbatim bodies are in `raw output/raw-<mode>.txt`, each with a header recording
the URL, status, timing and content-type.

### The blocker: throttling we cannot out-wait

GDELT asks for "one request every 5 seconds". That is not achievable from this
machine.

| Observation                                | Result                                 |
| ------------------------------------------ | -------------------------------------- |
| 5s gaps                                    | 429                                    |
| 15s gaps                                   | 429                                    |
| **90s cooldown, zero requests in between** | **429**                                |
| Burst of 7 requests                        | 429s, then socket-level `fetch failed` |

The last row matters: `fetch failed` is a connection refusal, not an HTTP
response. GDELT appears to shed connections under burst, so a retry storm makes
matters worse rather than better.

Egress IP is `200.88.134.15` with no proxy configured - a datacenter range, which
GDELT throttles aggressively. The 429 body names an address to contact for larger
query access, which is the documented escalation path.

**Consequence:** this endpoint cannot currently be used as a test fixture or as a
same-call integration. Hence `gdeltClient.test.ts` reproduces every failure mode
locally instead, and live verification proceeds one question at a time.

### Consequence for the agent tooling

At 8-26s per request, the brief's `gdeltScanCategories` across 22 categories is
**~5.5 minutes of wall clock** before any throttling. That does not fit a tool
call. `GDELT_MAX_CATEGORIES_PER_CALL` is therefore capped at **3**; `resolveCategories`
throws rather than truncating, because a silently shortened scan returns partial
coverage that reads as complete.

---

## What is still unverified

**Do not treat these as working.**

| Item                                                                         | Status                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `artlist` field schema                                                       | **Unconfirmed.** No successful `artlist` call has ever returned. |
| `timespan` grammar                                                           | **Unconfirmed.** Every attempt was rate-limited.                 |
| All 22 category queries                                                      | **Unverified.** Written from documented grammar, never run.      |
| `sourcelang` / `sourcecountry` / `domainis`                                  | **Unconfirmed.**                                                 |
| `timelinevol` shape                                                          | **Confirmed** - see finding 5.                                   |
| `timelinelang` shape                                                         | **Confirmed** - 25 language-named series.                        |
| `timelinevolraw`, `timelinevolinfo`, `timelinetone`, `timelinesourcecountry` | **Unconfirmed** - only ever rate-limited.                        |
| `maxrecords`, `sort` behaviour                                               | **Unconfirmed** against live data.                               |
| `theme:`, `tone<`, `near10:`, `repeat3:` operators                           | **Untested.**                                                    |

`GdeltCategory.verified` is `false` for every category and should stay `false`
until a non-empty, correctly-parsed response is observed for it.

The single hardest blocker remains **`artlist`**. Article search is the primary
tool the brief asks for, and it is the one mode we have never seen succeed.

---

## Running a sweep

`api/probe04-raw-sweep.ts` walks every mode and saves verbatim bodies. The gap is
8 seconds, GDELT's stated minimum (5s) plus margin:

```bash
npx tsx "utils/AI/gdelt tesing area/api/probe04-raw-sweep.ts"
```

Re-analyse the captures at any time — this costs no network budget:

```bash
npx tsx "utils/AI/gdelt tesing area/api/probe05-analyse-captures.ts"
```

---

## Deliberate choices

**Plain REST, not MCP.** `newsFlash` and `marketaux` use
`@modelcontextprotocol/client` because those services _are_ MCP servers. GDELT v2
is a plain HTTP API, so adding that dependency would serve no purpose.

**Retries only on 429.** A malformed query returns 400 and will never succeed on
retry, so retrying it would spend rate-limit budget for nothing. Asserted by test
section 5.

**Article-only parameters withheld from timeline modes.** The documentation warns
that a silently dropped parameter is indistinguishable from "no results" - the
same trap as finding 3. Asserted by test section 8.

**Categories are a separate registry**, never hardcoded in API functions, so
queries can be tuned without touching the HTTP layer.

---

## Next

1. Land one successful `artlist` call and pin the field schema.
2. Determine the real `timespan` grammar.
3. Tune category queries against real results; flip `verified` per category.
4. Only then build `gdeltSearchArticles` and promote into `mcp/GDELT/`.
5. Coverage, corroboration and tone modes come after those are solid.
