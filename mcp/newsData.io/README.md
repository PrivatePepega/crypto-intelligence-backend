# NewsData.io client

REST client for the **NewsData.io API v1**.

```bash
npx tsx mcp/newsData.io/apiEndpoints.test.ts
```

Exits 0 when every endpoint was probed, whether or not the plan allowed it.

## REST, not MCP

NewsData.io publishes an MCP server (`newsdata-mcp`), but it is a Python package
launched as a child process, and it **flattens the JSON response into a
line-oriented text digest**:

```
{ "result": "endpoint: latest\ntotal_results: 1253\nArticle 1:\ntitle: ..." }
```

Since the goal is to build our own tools over these endpoints, going direct to
the REST API avoids parsing that digest and keeps a Python process out of the
request path.

## Endpoint

```
https://newsdata.io/api/1
```

Auth is `apikey` as a query parameter. Override with `NEWSDATA_BASE_URL`.

`NEWSDATA_API_KEY` is the name NewsData.io documents; `NEWADATA_IO_API_KEY` is
accepted as an alias, which is the name in this project's `.env`.

## Endpoints

All eight, from the v1 docs:

| Endpoint | Returns | Fields | Free plan |
| --- | --- | --- | --- |
| `GET /latest` | articles, last 48h | 28 | works |
| `GET /crypto` | crypto articles | 23 | works |
| `GET /market` | market articles | 28 | works |
| `GET /sources` | publisher directory | 11 | works |
| `GET /archive` | historical articles | — | **403 AccessDenied** |
| `GET /count` | archive counts | — | **403 AccessDenied** |
| `GET /crypto/count` | crypto counts | — | **403 AccessDenied** |
| `GET /market/count` | market counts | — | **403 AccessDenied** |

Envelope:

```json
{ "status": "success", "results": [...], "totalResults": 489, "nextPage": "1791017329202755324" }
```

`nextPage` is an **opaque cursor**, not an offset. Pass `page=0,1,2…` to walk
it, or read `nextPage` and feed it back.

**Four endpoints are usable on the free plan.** `/archive` and all three
`/count` endpoints require a paid plan.

## Documented behaviour that is not true

Three changelog claims were tested and contradicted. Each had been encoded in
the client before being checked, which is why they are recorded here.

### 1. A filter is no longer required

The 2023-08-16 changelog says a query must carry one of `q`, `q_in_title`,
`domain`, … or it will not work. Measured: a bare `GET /latest` succeeds and
returns **779895** results.

An earlier version of `apiClient.ts` enforced this with `assertHasFilter`, which
would have rejected valid calls. Removed.

### 2. There is no working ticker filter on `/market`

The docs still show `symbol=MSFT,GOOGL`. The 2026-07-28 changelog says it was
replaced by `market_id`. Neither works:

| Filter | Result |
| --- | --- |
| `symbol=AAPL` | HTTP 422 `UnsupportedParameter` — "You can't use the symbol parameter in the /1/market endpoint" |
| `market_id=AAPL-US-NASDAQ` | HTTP 422 `UnsupportedFilter` — "The market_id parameter is invalid" |
| `organization=apple` | HTTP 403 `AccessDenied` — gated behind an upgrade |
| `q=AAPL` | **works** — 489 results |

Both `symbol` and `market_id` survive as **response** fields, which is likely
what the changelog meant. `q` full-text is the only way to filter market news by
ticker.

### 3. `size` is capped, and over-cap fails the whole call

`size=50` → HTTP 422 `UnsupportedFilter`. Free-plan maximum is 10, so
`clampSize()` truncates rather than letting the request fail.

## Plan-gated fields

These come back as **placeholder strings, not data**:

```
content          ONLY AVAILABLE IN PAID PLANS
sentiment        ONLY AVAILABLE IN PROFESSIONAL AND CORPORATE PLANS
sentiment_stats  ONLY AVAILABLE IN PROFESSIONAL AND CORPORATE PLANS
ai_tag           ONLY AVAILABLE IN PROFESSIONAL AND CORPORATE PLANS
ai_region        ONLY AVAILABLE IN CORPORATE PLANS
ai_org           ONLY AVAILABLE IN CORPORATE PLANS
ai_summary       ONLY AVAILABLE IN CORPORATE PLANS
```

A normalizer must treat them as absent. They are **present and non-empty**, so a
naive "does this field exist" check passes and hands the agent the literal text
`ONLY AVAILABLE IN PAID PLANS`.

Genuinely available on the free plan:

`article_id`, `link`, `title`, `description`, `keywords`, `creator`, `language`,
`country`, `category`, `datatype`, `pubDate`, `pubDateTZ`, `fetched_at`,
`image_url`, `source_id`, `source_name`, `source_priority`, `source_url`,
`source_icon`, `duplicate`, plus `coin` on `/crypto` and `symbol` / `market_id`
on `/market`.

`article_id` is a stable 32-character id and the only reliable deduplication key.

## Field sets differ per endpoint

`/latest` 28 fields, `/crypto` 23, `/market` 28, `/sources` 11.

- `/crypto` returns `coin`, and omits `country`, `category`, `datatype`.
- `/market` returns `symbol` and `market_id`.
- `/sources` is not article-shaped at all: `id`, `name`, `url`, `icon`,
  `priority`, `description`, `category`, `language`, `country`,
  `total_article`, `last_fetch`.

A shared article normalizer therefore needs most fields optional.

## Error handling

Two distinct failure shapes, both handled by `newsDataRequest`:

- **HTTP 4xx** — plan refusals (403 `AccessDenied`) and bad parameters
  (422 `UnsupportedParameter` / `UnsupportedFilter`).
- **HTTP 200 with `status: "error"`** — validation failures. Checking only the
  HTTP status would let these through as successes.

Both raise `NewsDataApiError` carrying the upstream `code`.

## Layout

| File | Role |
| --- | --- |
| `apiClient.ts` | REST client, plan clamping, error mapping |
| `apiEndpoints.test.ts` | Probes all eight endpoints at `size=3` |
| `raw/api/` | One capture per endpoint, plus `_report.json` |

`raw/api/` is regenerated output, not source — safe to delete and re-create.

## Client API

| Export | Purpose |
| --- | --- |
| `fetchLatestNews(params, signal?)` | `GET /latest` |
| `fetchArchiveNews(params, signal?)` | `GET /archive` (paid) |
| `fetchCryptoNews(params, signal?)` | `GET /crypto` |
| `fetchMarketNews(params, signal?)` | `GET /market` |
| `fetchNewsSources(params?, signal?)` | `GET /sources` |
| `fetchNewsCount(params, signal?)` | `GET /count` (paid) |
| `fetchCryptoCount(params, signal?)` | `GET /crypto/count` (paid) |
| `fetchMarketCount(params, signal?)` | `GET /market/count` (paid) |
| `newsDataRequest(path, params, signal?)` | Any endpoint, raw envelope |
| `readArticles(envelope)` / `readSources(envelope)` | Array extraction |
| `clampSize(size)` | Truncates to the free-plan max |
| `FREE_PLAN_MAX_SIZE` | `10` |
| `isNewsDataConfigured()` | Whether a key is present |
| `describeNewsDataBaseUrl()` | Base URL, safe to log |
| `NewsDataApiError` | Carries `status`, `path`, `code` |

## Licensing

NewsData.io data is subject to their Terms of Service and plan attribution
requirements. Check before redistributing.