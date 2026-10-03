# GDELT Cloud discovery findings

Raw, un-normalized output. Normalizers are deliberately **not** written yet —
this document is the input to that decision.

## Running it

```bash
# all 7 tools, one file each
npx tsx mcp/GDELT/fetchAll.ts

# one tool at a time
npx tsx mcp/GDELT/runTool.ts search_events --pretty
npx tsx mcp/GDELT/runTool.ts search_events '{"days":7,"categories":["ECONOMIC"]}' --pretty

# the by-id tools need an id that only exists after a search
npx tsx mcp/GDELT/runTool.ts get_event '{"event_id":"<id from search_events>"}' --pretty
```

`--pretty` prints the envelope/record shape without dumping the body. Output
lands in `mcp/GDELT/raw/<tool>.json`, one readable file per tool.

## Record limit

Every list tool is captured with **`limit: 1`**, so each raw file holds a single
record and its full shape stays readable. The default lives in
`gdeltClient.ts` as `DEFAULT_RECORD_LIMIT` and is applied by
`withDefaultLimit`, which every list fetcher passes its arguments through.
An explicit `limit` always wins, so normalizers needing volume are unaffected.

`limit` means two different things depending on the tool:

- on `search_events` / `search_stories` / `get_story_articles` it caps **records**
- on `summarize_events` / `summarize_stories` it caps **aggregate buckets**

### ⚠️ `summarize_events` / `summarize_stories` ignore `limit`

Both document `limit` as "Maximum number of summary buckets" (default 50, max
500), but it is **not applied**. Measured on a `group_by: date, days: 7` window:

| sent `limit` | buckets returned |
| --- | --- |
| 1 | 7 |
| 2 | 7 |
| 3 | 7 |

For contrast, `search_events` honours it exactly (1 → 1, 3 → 3).

So the `limit: 1` default does **not** shrink the summarize tools. Their
captured files hold a full 7-day rollup, and **the window length is what bounds
them**. To capture a small summarize fixture, narrow the window:

```bash
npx tsx mcp/GDELT/runTool.ts summarize_events '{"group_by":"date","days":1}'
```

**Open question for the normalizers:** treat the summarizers as "always return
the whole window" (and slice client-side if needed), or is this a bug worth
reporting upstream?

## How to read a raw file

Each `raw/<tool>.json` is `{ generatedAt, tool, args, isError, response }`, where
`response` is the upstream envelope. Records live at
**`response._gdelt.payload.data`** — not the root, which holds `view` (a
PatternFly UI tree) and `$prefab`.

Two things to keep in mind while reading them:

1. `get_event` and `get_story` return `data` as a **single object**; the other
   five return arrays.
2. `get_story_articles` has a **broken upstream `digest`** that echoes the
   parent Story's fields, so article data exists only under `payload`.

---

## 1. GDELT does not expose data tools directly

The server lists **49 tools**, but only three touch data. The ~106 real tools
are reached through a progressive-discovery indirection:

| Wrapper | Purpose |
| --- | --- |
| `gdelt_cloud_tool_list` | browse the catalogue |
| `gdelt_cloud_tool_get` | input/output schema for one tool |
| `gdelt_cloud_tool_call` | **invoke** one |

`gdelt_cloud_tool_call` accepts exactly:

```json
{ "tool_name": "search_events", "tool_arguments": { ... } }
```

### The bug that blocked all four existing tests

The nesting key is **`tool_arguments`**. The previous `searchEvents.fetcher.ts`
passed `arguments`, and every call in `fetcher-results.json` failed:

```
1 validation error for call[category_tool_call]
arguments
  Unexpected keyword argument [type=unexpected_keyword_argument]
```

Passing `arguments` is a *runtime* rejection, not a schema error at connect
time — the wrapper's own `inputSchema` has `additionalProperties: false`, so a
bad key surfaces as an opaque pydantic message rather than a client-side
validation failure.

---

## 2. The response is not the advertised schema

`outputSchema` promises `{ success, data, applied_filters, pagination, sort }`.
**That is not what comes back.** Every tool returns:

```
{
  "$prefab": { ... },
  "view":    { cssClass, type: "Div", children: [...] },  // PatternFly UI tree
  "theme":   { ... },
  "_gdelt":  {
    tool:    "search_events",
    view:    "events",
    payload: { success, data, pagination, sort, applied_filters, meta },
    digest:  { success, sort, applied_filters, pagination, meta, data },
    args:    { ...echo of the request... }
  }
}
```

**`_gdelt.payload` holds the data.** `_gdelt.digest` holds a *pre-trimmed
twin of the same records* — upstream already does most of the condensing you
might otherwise write a normalizer for. `view` is presentation only.

---

## 3. `data` is not always an array

This is the highest-risk detail for a normalizer:

| Tool | `data` shape | `success` at |
| --- | --- | --- |
| `search_events` | **array** | payload |
| `summarize_events` | **array** | payload |
| `get_event` | **single object** | payload |
| `search_stories` | **array** | payload |
| `summarize_stories` | **array** | payload |
| `get_story` | **single object** | payload (no `meta`) |
| `get_story_articles` | **array** | payload |

`Array.isArray(data)` is **false** for `get_event` and `get_story`. A normalizer
written against the advertised schema would silently return nothing for the two
by-id tools. Both shapes appear in `digest.data` too.

---

## 4. Empty results are annotated, and empty ≠ quiet

`search_events` with a too-narrow filter returned `200`, `data: []`, and a
`note`:

> No events matched these filters in this window. Empty means **NO COVERAGE** for
> this combination — **NOT zero real-world activity**. An invalid parameter value
> would have returned 400 with the accepted values, so a 200 with an empty array
> means the filters were understood and nothing matched. Narrowing filters on this
> request, most restrictive first: `search=central bank rate decision`,
> `category=ECONOMIC`. Try relaxing search first.

`data: []` is a **coverage gap**, not a finding. `summarize_stories` carries the
equivalent as `notice` plus a `counting_basis` key. A normalizer should surface
these rather than let the agent read "0 events" as "nothing happened".

---

## 5. Payload vs digest, per tool

Upstream's own trim. Useful as a floor for what "concise" can mean.

| Tool | payload record | digest record | dropped by digest |
| --- | --- | --- | --- |
| `search_events` | 43 fields | **16** | 27 |
| `get_event` | 44 fields | **16** | 28 |
| `search_stories` | 27 fields | **12** | 15 |
| `get_story` | 27 fields | **12** | 15 |
| `summarize_events` | 40 fields | **5** | 36 (adds `count`) |
| `summarize_stories` | 23 fields | **5** | 19 (adds `count`) |
| `get_story_articles` | 13 fields | 12 | **see below** |

### search_events: the 27 fields upstream drops

```
title_source, observed_at, event_date_basis, event_date_evidence, coded_at,
updated_at, processed_at, subcategory_label, event_description, taxonomy_status,
domain, event_code, geo_context, fatalities_basis, fatalities_corroboration,
fatalities_evidence, fatalities_supporting_source_count, injured,
civilians_killed, civilians_injured, civilian_targeting, civilian_targeting_label,
story_refs, language_breakdown, top_language, search_score, incident
```

Kept: `id, title, category, subcategory, event_date, family, geo, summary,
metrics, has_fatalities, fatalities, actors, entity_refs, top_articles, url,
primary_story_url`.

### ⚠️ get_story_articles digest is wrong upstream

Its `digest.data[0]` keys are the **Story's** fields
(`category, story_date, geo, has_fatalities, fatalities, metrics,
linked_events, entity_refs, top_articles`), **not** the article's. The article
fields — `domain, article_date, rank, role, language,
publisher_country_iso3, domain_avatar_url` — are precisely the ones stripped.

So for this one tool `digest` is a copy-paste of the story digest and carries
**no article data at all**. There is no way to get article records from
`digest`; a normalizer must read `_gdelt.payload.data`. This looks like an
upstream bug, and it is worth confirming before relying on `digest` anywhere.

---

## 6. Nested structure (payload records)

**Events** — `geo{9}`, `geo_context{2}`, `metrics{11}`, `incident{3}`;
arrays `actors`, `story_refs`, `entity_refs`, `top_articles`,
`language_breakdown`.

**Stories** — `geo{9}`, `geo_context{2}`, `metrics{5}`; arrays `linked_events`,
`entity_refs`, `matched_categories`, `top_articles`, `language_breakdown`.

**Summary buckets** — `metrics{7}` (events) / `metrics{4}` (stories), plus ~35
flat `avg_/min_/max_` triples.

Two things worth deciding before normalizing:

- `entity_refs` on a story was **10 entries** vs **0** on an event, and
  `top_articles` **3** vs **1**. Arrays are the bulk of the payload.
- `image_url` appears on the by-id tools but not the search tools, even with
  `include_images` unset — worth checking whether the default `true` is being
  honoured.

---

## 7. Constraints that shape any normalizer

From the tool descriptions:

- **Windows are capped at 30 inclusive days.** A calendar month is too long.
  Continuous events coverage begins **2026-03-01**.
- **No pagination on the summarize tools** — each date chunk is a separate call.
- `search` defaults to `search_mode: "semantic"`, which costs an embedding call
  and can return `503 SEMANTIC_SEARCH_UNAVAILABLE`. `lexical` is the cheap path.
  There is no boolean parser: `a OR b` is reduced to the first term.
- `country` means *location **or** actor origin* by default, so a filtered total
  and a `group_by=country` bucket for the same country can disagree. Pass
  `country_match=location` to make them agree.
- The summarize tools reject `search`; `summarize_stories` also drops the actor
  dimensions, since a Story has no source/target actor.

---

## 8. Open questions for the normalizer step

1. **payload or digest?** digest is 5–16 fields and free, but
   `get_story_articles` proves digest can be wrong. Safest: payload as the
   source, digest as the size target.
2. **How deep into `actors` / `entity_refs` / `top_articles`?** These are the
   bulk of the payload.
3. **Keep the evidence fields?** `event_date_evidence`,
   `fatalities_evidence`, `fatalities_corroboration` are provenance for
   casualty numbers. Useful for verification, expensive in tokens.
4. **Which of the ~35 summary `avg_/min_/max_` triples matter** for agents?
   digest keeps only `count, article_count, avg_article_count`.
5. **Keep `meta` / `applied_filters`?** `meta.coverage` and
   `meta.query_window` are what let you tell a coverage gap from a real zero.
6. **`summarize_*` with no `group_by`?** defaults to `date`; worth confirming
   `country` / `category` / `subcategory` are what the agents will actually use.

---

## 9. File map

| File | Role |
| --- | --- |
| `gdeltClient.ts` | shared connection + `callGdeltTool` (**`tool_arguments`**) |
| `gdelt.types.ts` | input types transcribed from live schemas |
| `fetchers/events.ts` | `fetchSearchEvents`, `fetchGetEvent` |
| `fetchers/summarizeEvents.ts` | `fetchSummarizeEvents` |
| `fetchers/stories.ts` | `fetchSearchStories` |
| `fetchers/storyArticles.ts` | `fetchSummarizeStories`, `fetchGetStory`, `fetchGetStoryArticles` |
| `fetchers/index.ts` | barrel export |
| `fetchAll.ts` | all 7 tools -> `raw/<tool>.json` |
| `runTool.ts` | one tool -> `raw/<tool>.json`, `--pretty` for shape |
| `raw/` | captured raw responses (generated, safe to delete) |

Removed: the earlier `probe.ts` / `inspect.ts` / `shape.ts` schema scripts and
the combined `raw-fixtures.json`, superseded by `runTool.ts --pretty` and the
per-tool files. The pre-existing `searchEvents.fetcher.ts` and `fetcher.ts.ts`
were deleted too - both encoded the broken `arguments` key.