# Tool relationships — the answer to the fetch question

Researched from the GDELT Cloud docs (https://docs.gdeltcloud.com/mcp/tools,
`/api-reference`) and verified against live responses.

## The short version

**`summarize_events` and `summarize_stories` never accept an id, and they are not
summarised searches.** They are separate aggregate endpoints. So no search feeds
them, and `search_events` / `search_stories` should **not** be deleted.

| Tool | Endpoint | Takes | Returns |
| --- | --- | --- | --- |
| `search_events` | `GET /api/v2/events` | window + filters | individual Event cards, **with ids** |
| `summarize_events` | `GET /api/v2/events/summary` | window + filters + `group_by` | one aggregate bucket per group, **no ids** |
| `get_event` | `GET /api/v2/events/{id}` | **event_id** | 1 Event, single object |
| `search_stories` | `GET /api/v2/stories` | window + filters | individual Story records, **with ids** |
| `summarize_stories` | `GET /api/v2/stories/summary` | window + filters + `group_by` | one aggregate bucket per group, **no ids** |
| `get_story` | `GET /api/v2/stories/{id}` | **story_id** | 1 Story, single object |
| `get_story_articles` | `GET /api/v2/stories/{id}/articles` | **story_id** | article records, array |

### Why search and summarize are not interchangeable

| | `search_events` | `summarize_events` |
| --- | --- | --- |
| rows | one per event | one per group |
| ids | yes, per card | **none** |
| content | full 44-field card | counts + metric averages |
| answers | "what happened?" | "how much / how often / trending how?" |

`search_events` gives you records to read. `summarize_events` gives you volume
and trend without pulling the records. Upstream's own tool description says to
reach for the summary **first** for counts and coverage maps, **then** drill into
individual events. Keep both.

## How the summarize fetchers actually work — measured, not assumed

I got this wrong the first time and re-tested it. `limit` **does** cap buckets:

```
summarize_events   group_by=country  limit 1 -> 1    limit 10 -> 10   limit 50 -> 50
summarize_stories  group_by=category limit 3 -> 3    limit 10 -> 10
```

**One exception: `group_by: date` ignores `limit`.**

```
summarize_events   group_by=date  limit 5 -> 29   limit 10 -> 29   limit 50 -> 29
```

`group_by: date` returns every day in the window whatever `limit` says, so the
window length is what bounds that case. That is what fooled me earlier — I
tested only `group_by: date`, saw no capping, and wrongly concluded `limit` was
ignored everywhere.

Verified at the new default:

| Call | Returns |
| --- | --- |
| `search_events({ days: 3 })` | 20 records |
| `summarize_events({ group_by: "country", days: 7 })` | 20 buckets |
| `summarize_events({ group_by: "date", days: 7 })` | 6 buckets (window-bound) |
| `summarize_stories({ group_by: "category", days: 7 })` | 11 buckets |

## The MCP dispatcher silently DROPS invalid parameters

This is why the earlier id probe "succeeded". The docs say the API returns 400
for `search`, `cursor` and `sort` on the summary endpoints. Through
`gdelt_cloud_tool_call` none of them error — the dispatcher drops undeclared
keys before forwarding:

```
summarize_events + search=bitcoin   isError=false   unchanged result
summarize_events + cursor=abc       isError=false   unchanged result
```

So a bad parameter yields a plausible answer to a *different* question instead of
an error. Both summarize fetchers now reject those parameters client-side:

```
summarize_events + search   ->  summarize_events does not accept: search.
                                Use fetchSearchEvents for search/sort/cursor.
```

This also corrects my earlier mechanism claim: the ids were not "accepted and
ignored" by the API — they never reached it.

## Limits

`DEFAULT_RECORD_LIMIT = 20` in `gdeltClient.ts`, applied by `withDefaultLimit` to
every list fetcher. An explicit `limit` always wins. Upstream caps search rows
at 100 and summary buckets at 500, so 20 sits inside both.

---

## What actually chains

```
search_events  --[id]-->  get_event          (2 calls)
search_stories --[id]-->  get_story  --[same id]-->  get_story_articles   (3 calls)

summarize_events   : standalone. window + group_by, no id in, no id out
summarize_stories  : standalone. window + group_by, no id in, no id out
```

There is also a reverse edge, since an event card carries `story_refs[].id`:
`search_events -> story_refs[0].id -> get_story`. Verified: event
`conflict_574b2dc178a74941` → story `abd67b654735`.

---

## You cannot feed an id to a summarize tool — probed, not assumed

`probeSummarizeId.ts` tests this directly rather than taking the docs' word for
it.

**There is no id parameter.** Listing every accepted parameter from the live
schema:

- `summarize_events`: 33 params, **0 id-like**
- `summarize_stories`: 21 params, **0 id-like**

All of them are filters (`group_by`, `start_date`, `days`, `country`,
`category`, `significance_min`, …).

**And an id passed anyway is silently dropped.** Feeding a real event id under
four plausible names each returned **byte-identical** results:

```
event id from search_events: conflict_574b2dc178a74941

  pass event_id=...   isError=false  buckets=6   "22,068 total events"
  pass id=...         isError=false  buckets=6   "22,068 total events"
  pass event_ids=[...] isError=false buckets=6   "22,068 total events"
  pass entity=...     isError=false  buckets=6   "22,068 total events"
```

Same 22,068 events every time — the key was ignored, not honoured. Note this is
worse than a rejection: `search_events` returns 400 for an unsupported filter, so
you get a loud failure there, but `summarize_events` swallows it. Wiring an id
into these fetchers would produce a plausible-looking result that silently
ignores the id.

## Scoping a summarize to a searched record instead

`scopeSummarize.ts` does this by taking the record's **own dimensions** — its
date, country and category — which are all accepted filters:

```
search_events -> event conflict_574b2dc178a74941
  event_date 2026-10-01   category Battles   country Ethiopia

summarize_events {"group_by":"date","start_date":"2026-10-01",
                  "end_date":"2026-10-01","country":["Ethiopia"],
                  "category":"Battles"}
  -> key=2026-10-01  eventCount=2  conflict=2  fatal=61
```

```
search_stories -> story 8608afb1d928
  story_date 2026-10-02   category_code conflict_security   country Iran

summarize_stories {"group_by":"date","start_date":"2026-10-02",
                   "end_date":"2026-10-02","country":["Iran"]}
  -> key=2026-10-02  storyCount=191  withEvents=33  linkedEvents=34
```

That is "what else happened in this slice", not "summarise this one event" —
the difference matters. A single event cannot be summarised; it has no
distribution to average.

## The summary → search flow, which is the documented one

The chain that genuinely exists runs the **other way**:
`summarize_events(group_by=subcategory)` surfaces the sub-codes that actually
carry events, and those feed back into `search_events`:

```
summarize_events(group_by=subcategory, category=Battles) -> 3 bucket(s)
  Armed clash                         events=70
  Government regains territory        events=10
  Non-state actor overtakes territory events=5

feed back: category=Battles  subcategory="Armed clash"
  -> 3 event(s)
     conflict_4f559ef3fedc9a63  Mali Armed Forces kill 50 militants in Kidal region
     conflict_87f53273f714eb7b  Ansarullah and Yemeni government forces clash near B…
     conflict_5f053c411798aca1  Russian forces advance and take buildings in Dobrop…
```

Upstream's docs call this out specifically, including the warning that
*publication is not coverage* — a defined code can carry zero events in any
given window. That is exactly what `group_by=subcategory` is for: measure which
codes are live before filtering on one.

## Ids

Read from `id` on the first record of `_gdelt.payload.data`. Verified the chain
carries the same string through: search returned `8608afb1d928`, `get_story`
returned `id: 8608afb1d928`.

- Stories: short hex, `8608afb1d928`
- Events: family-prefixed, `conflict_574b2dc178a74941`
- The record's `url` is the human page — **not** the id. Passing it will not work.

---

# Fetchers — one file per tool

| File | Tool |
| --- | --- |
| `fetchers/searchEvents.ts` | `search_events` |
| `fetchers/summarizeEvents.ts` | `summarize_events` |
| `fetchers/getEvent.ts` | `get_event` |
| `fetchers/searchStories.ts` | `search_stories` |
| `fetchers/summarizeStories.ts` | `summarize_stories` |
| `fetchers/getStory.ts` | `get_story` |
| `fetchers/getStoryArticles.ts` | `get_story_articles` |
| `fetchers/index.ts` | barrel + `GDELT_FETCHERS` dispatch map |

Was 5 files; now 7. Each carries its own doc comment covering what it takes,
what it returns, and its quirks.

## Three fetcher quirks worth knowing

**`summarize_events` / `summarize_stories` ignore `limit`.** The schema documents
it as capping buckets, but `limit` 1, 2 and 3 all return identical buckets.
**The window length is what bounds them.** The two summarize fetchers
deliberately do *not* apply the `limit: 1` default — doing so would imply a
smaller response than actually returns.

**`get_event` / `get_story` return a single object; the rest return arrays.**
Check before indexing.

**`get_story_articles`'s `_gdelt.digest` is wrong upstream** — it repeats the
*parent Story's* fields, so article data exists only under
`_gdelt.payload.data`. Use `payload` for that tool.

---

# Normalizers — all 7

| File | Tool | Raw fields | Normalized |
| --- | --- | --- | --- |
| `searchEvents.normalizer.ts` | `search_events` | 44 | 9 |
| `summarizeEvents.normalizer.ts` | `summarize_events` | 5–40 | 40 |
| `getEvents.normalizer.ts` | `get_event` | 44 | 7 |
| `getSearchStories.normalizer.ts` | `search_stories` | 28 | 5 |
| `summarizeStories.normalizer.ts` | `summarize_stories` | 23 | 23 |
| `getStory.normalizer.ts` | `get_story` | 27 | 4 |
| `getStoryArticles.ts` | `get_story_articles` | 13 | 2 |

The two summarize normalizers are **new**; the other five are yours, unchanged.

## The summarize normalizers are deliberately wide

You said to include anything uncertain so you can prune. They expose all 40 / 23
fields rather than guessing at a minimal set.

**That means the `group_by: date` files are mostly null.** A date bucket only
*has* 5 fields upstream, so 35 of 40 normalize to `null`. Verified this is the
shape, not a mapping failure:

```
summarize_events (group_by=date):  upstream 5 fields -> normalized 4/40 populated
  raw key=2026-09-27  ->  normalized key=2026-09-27       ✓
  raw event_count=0  ->  normalized eventCount=0          ✓
  avgSignificance = null  (upstream never sent it)        ✓ correct
```

Same for `summarize_stories` by date: 23 upstream fields, all populated. The
nulls are confined to the date grouping, where the non-date fields genuinely do
not exist.

## Naming conventions

Existing normalizers use `id`, `title`, `summary`, `category`, `region`,
`significance`. The new ones follow the same camelCase-of-the-raw-name
convention (`avg_significance` → `avgSignificance`) and keep `key` for the
bucket value.

---

# Running it

```bash
npx tsx mcp/GDELT/captureRaw.ts       # raw/ - what upstream sent
npx tsx mcp/GDELT/testNormalizers.ts  # normalized/ - what the agents get
```

`testNormalizers.ts` runs all 7 against the captured payloads, so a field rename
or a missed `?? null` shows up as a `null` in `normalized/` rather than passing
silently. Review that folder and trim what the agents do not need.

## Files

| File | Role |
| --- | --- |
| `gdeltClient.ts` | shared connection, `tool_arguments` nesting, `limit: 1` default |
| `gdelt.types.ts` | input types transcribed from the live schemas |
| `fetchers/` | 7 fetchers, one per tool |
| `normalizers/` | 7 normalizers |
| `captureRaw.ts` | raw capture, all 7 tools |
| `testNormalizers.ts` | normalizer runner |
| `probeSummarizeId.ts` | proves the summarize tools take no id |
| `scopeSummarize.ts` | scopes a summarize to a searched record's slice |
| `raw/` | captured upstream payloads, safe to delete |
| `normalized/` | normalizer output, safe to delete |

## Still open

**`get_story_articles` keeps only `id` and `title`**, dropping `url`, `domain`,
`article_date`, `language`, `role` and `rank` — a normalized article cannot be
cited. Worth widening if agents need sources.

**`get_story` drops `significance`**, which `search_stories` keeps.