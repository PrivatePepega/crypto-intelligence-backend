# EIA Energy Market Data

Collector for U.S. energy benchmark prices and supply/demand fundamentals from
the U.S. Energy Information Administration (EIA) API v2.

Script: `collectors/assets/energy/eiaFetchers.ts`

Output: `collectors/assets/energy/data/` with an `eia ` file prefix.

```powershell
npx.cmd tsx collectors/assets/energy/eiaFetchers.ts --mode=series --series=RWTC,WCESTUS1 --write
```

The EIA is the **source of the observations**, not a source of canonical asset
identity or taxonomy. Series ids, periods, values and units are stored as
reported. Benchmark identity, `commodity_type` and `value_drivers` are curated by
this collector and labelled as such.

## Endpoints

Base URL: `https://api.eia.gov/v2`

| Purpose         | Request                                  |
| --------------- | ---------------------------------------- |
| Series metadata | `GET /{route}/facet/series/`             |
| Series data     | `GET /{route}/data/?facets[series][]=ID` |
| Route hierarchy | `GET /`                                  |

`{route}` is a provider path such as `petroleum/pri/spt`. The collector never
invents a route or a series id: every route/id pair below was confirmed by both
the route's `facet/series/` listing and a real data response.

Configuration:

| Variable                  | Meaning                                        |
| ------------------------- | ---------------------------------------------- |
| `EIA_API_KEY`             | Required. Existing key; never logged/persisted |
| `EIA_BASE_URL`            | Optional base URL override                     |
| `EIA_REQUESTS_PER_MINUTE` | Optional rate override (default 60)            |

This is the only EIA client in the repository. No second client, credential or
duplicated environment configuration is introduced. The key is redacted from
every URL this module logs or writes.

## Verified series (2026-10-27)

All values below come from live responses, not documentation. `Total` is the
provider's own row count for the whole series.

| Series                 | Route                   | Frequency | Unit     | Total | Measures                                               |
| ---------------------- | ----------------------- | --------- | -------- | ----- | ------------------------------------------------------ |
| `RWTC`                 | `petroleum/pri/spt`     | daily     | `$/BBL`  | 10276 | Cushing, OK WTI spot price FOB                         |
| `RBRTE`                | `petroleum/pri/spt`     | daily     | `$/BBL`  | 10003 | Europe Brent spot price FOB                            |
| `WCESTUS1`             | `petroleum/stoc/wstk`   | weekly    | `MBBL`   | 2299  | U.S. ending stocks of crude oil excluding SPR          |
| `WCRFPUS2`             | `petroleum/sum/sndw`    | weekly    | `MBBL/D` | 1863  | U.S. field production of crude oil                     |
| `MCRFPUS2`             | `petroleum/crd/crpdn`   | monthly   | `MBBL/D` | 1279  | U.S. field production of crude oil                     |
| `MCRIMUS2`             | `petroleum/move/imp`    | monthly   | `MBBL/D` | 1279  | U.S. imports of crude oil                              |
| `MCREXUS2`             | `petroleum/move/exp`    | monthly   | `MBBL/D` | 1279  | U.S. exports of crude oil                              |
| `WPULEUS3`             | `petroleum/pnp/wiup`    | weekly    | `%`      | 1877  | U.S. percent utilization of refinery operable capacity |
| `WGFUPUS2`             | `petroleum/sum/sndw`    | weekly    | `MBBL/D` | 1863  | U.S. product supplied of finished motor gasoline       |
| `WDIUPUS2`             | `petroleum/sum/sndw`    | weekly    | `MBBL/D` | 1863  | U.S. product supplied of distillate fuel oil           |
| `NW2_EPG0_SWO_R48_BCF` | `natural-gas/stor/wkly` | weekly    | `BCF`    | 877   | Lower-48 working underground natural gas storage       |
| `N9070US2`             | `natural-gas/prod/sum`  | monthly   | `MMCF`   | 355   | U.S. dry natural gas production                        |
| `N9140US2`             | `natural-gas/cons/sum`  | monthly   | `MMCF`   | 307   | U.S. total natural gas consumption                     |

Unit tokens are the provider's, recorded verbatim:

| Token    | Meaning                  |
| -------- | ------------------------ |
| `$/BBL`  | U.S. dollars per barrel  |
| `MBBL`   | thousand barrels         |
| `MBBL/D` | thousand barrels per day |
| `%`      | percent                  |
| `BCF`    | billion cubic feet       |
| `MMCF`   | million cubic feet       |

Frequency and unit are **pinned per series** in
`collectors/assets/energy/eiaSeriesCatalog.ts`. Neither is a CLI flag.

## Provider behavior that shaped the collector

### `frequency` is an aggregation control, not a filter

This is the most important discovery. Requesting the daily `RWTC` series with
`frequency=weekly` returns HTTP 200 with weekly **averages**, not an error and not
the daily rows:

| Request             | Period       | Value    |
| ------------------- | ------------ | -------- |
| `frequency=daily`   | `2026-10-20` | `107.89` |
| `frequency=weekly`  | `2026-10-16` | `99.93`  |
| `frequency=monthly` | `2026-09`    | `97.31`  |

A collector that lets frequency float would therefore store an aggregate as if it
were a native observation. Every series carries one pinned cadence, the request
always uses it, and a period that does not match that cadence is rejected during
normalization.

### 5,000-row cap

`length` above 5,000 is silently clamped and the response carries an
`incomplete return` warning. Long series are paginated with `offset` and
`length<=5000`; `truncated` is reported when fetched rows are fewer than
`response.total`.

### Numbers arrive as strings

Both `response.total` (`"10276"`) and each row's `value` (`"107.89"`) are strings.
They are parsed explicitly. Unparsable values (`null`, `""`, `"NA"`, `"--"`,
free text) **reject the row**; they are never stored as `0`.

### Two error shapes

| Status | Body                                                           | Meaning                 |
| ------ | -------------------------------------------------------------- | ----------------------- |
| 400    | `{ "error": "Requested path ... is not valid.", "code": 400 }` | Bad route               |
| 403    | `{ "error": { "code": "API_KEY_MISSING", ... } }`              | No key                  |
| 403    | `{ "error": { "code": "API_KEY_INVALID", ... } }`              | Bad key                 |
| 429    | —                                                              | Rate limit; retried     |
| 5xx    | —                                                              | Provider fault; retried |

Both shapes are read. 400/401/403 fail immediately; 429/timeout/network/5xx retry
with backoff up to three attempts.

### Unknown series is not an error

An unrecognised series id returns HTTP 200 with `total: "0"` and an empty `data`
array. That is a valid empty result. Because this is indistinguishable from a
legitimately empty window, the collector treats "zero observations" as a note, not
a failure, and the catalog is the only thing that decides which ids may be
requested.

### Facet metadata lives on a subresource

`GET /{route}/` returns the route description but **empty facet arrays**; the
series list comes from `GET /{route}/facet/series/`. The collector does not depend
on metadata at runtime because the catalog is verified and pinned.

### No rate-limit headers

The provider sends none, so the collector enforces its own rate limit (default
60 rpm) and a hard request budget (default 120 per run).

## Database mapping

| Table                        | Content                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `assets.assets`              | Price series only: `asset_type='commodity'`, ids in `external_ids.eia` |
| `assets.commodities`         | Benchmark, currency, unit of measure, curated value drivers            |
| `assets.series_observations` | Every scalar daily/weekly/monthly observation                          |
| `assets.information`         | Latest observation per series                                          |

### `assets.series_observations`, not `assets.asset_price_history`

`assets.asset_price_history` requires genuine OHLC candles. An EIA value is a
single scalar measurement; it has no open, high, low or close. Writing one scalar
into four OHLC columns would invent data, and writing it as a degenerate candle
would corrupt the meaning of the table. **This collector never writes
`asset_price_history`.** That is enforced in code and asserted in the repository
test.

The dedicated table was added as `database/sql/assets/02-series-observations.sql`:

- `UNIQUE (provider, series_id, frequency, period)` — the idempotency key.
- `period` is `TEXT`, not `DATE`, so a monthly `YYYY-MM` period is never given an
  invented day of month. A CHECK constraint enforces the format per frequency.
- `frequency` is part of identity, so daily, weekly and monthly observations can
  never be merged into one series.
- `observed_at` stays `NULL`: EIA reports a period, not an instant. `period` is the
  recorded time; `collected_at` is when this collector fetched it.
- `value` is nullable in the DDL for provider gaps, but the collector rejects
  unusable values before insert, so collected rows always have a value.

Upserts use `ON CONFLICT ... DO UPDATE` on that key. A re-run updates in place and
reports `inserted` vs `updated`; repeated runs insert zero new rows.

### Asset identity

- `assets.symbol` is the **EIA series id** (`RWTC`, `RBRTE`), matching the FMP
  collector's provider-symbol convention. Inventing a ticker such as `WTI` would
  assert an equivalence the provider never stated.
- `RBRTE` is Europe Brent **spot** FOB. It is deliberately a **separate asset**
  from `BZUSD`, which is FMP's Brent **futures** contract. The two differ in price
  on the same day and are not interchangeable.
- `assets.assets` has no unique constraint on `(symbol, asset_type)`, and this
  change does not alter the schema. Identity is resolved by lookup before insert,
  inside the caller's transaction: match on `symbol` or
  `external_ids->'eia'->>'series'`.
- Existing `symbol` and `name` are never overwritten; only `external_ids.eia` is
  merged, so manually curated identity survives re-runs.
- `assets.commodities` upserts with `COALESCE`, so `NULL` metadata can never erase
  a curated value.

Commodity metadata:

| Asset   | `commodity_type` | `benchmark` | `currency` | `unit_of_measure` |
| ------- | ---------------- | ----------- | ---------- | ----------------- |
| `RWTC`  | `energy`         | `WTI`       | `USD`      | `USD per barrel`  |
| `RBRTE` | `energy`         | `Brent`     | `USD`      | `USD per barrel`  |

`unit_of_measure` is a label expansion of the provider token `$/BBL`, not a
conversion. The provider token itself is recorded in `external_ids.eia.unit` and
on every observation.

`value_drivers` is populated for `RWTC` only:

```json
{
  "provenance": "collector-curated",
  "note": "EIA series that describe the same U.S. crude oil market. This is taxonomy, not a causal claim.",
  "related_eia_series": ["WCESTUS1", "WCRFPUS2", "..."]
}
```

`RBRTE` is `NULL`, because EIA's U.S. crude statistics describe the domestic
market, not the waterborne Brent benchmark.

### Snapshots

- Price series → `information_type = 'market_snapshot'`, linked to their asset.
- Supply/demand series → `information_type = 'macro_context'`, `asset_id = NULL`.
  These are market-wide statistics; attaching them to one benchmark contract would
  be an editorial assertion.

`assets.information` has no unique key, so idempotency comes from a guarded
insert on `data->>'snapshot_key'`. The key is
`eia:<series>:<frequency>:<period>:latest`, so re-running the same period is a
no-op while a newly published period creates a new snapshot row. The payload
carries `source`, `series_id`, `series_name`, `route`, `category`, `kind`,
`frequency`, `period`, `value`, `unit`, `observed_at: null`, `collected_at` and a
`limitations` array.

## CLI

| Mode           | Output                                              |
| -------------- | --------------------------------------------------- |
| `catalog`      | Verified series catalog (no API request)            |
| `series`       | The requested series only                           |
| `all`          | Every verified series                               |
| `availability` | One live row per series, to detect unit/route drift |
| `readback`     | Stored observations and snapshots (read-only)       |

| Option                   | Meaning                                                   |
| ------------------------ | --------------------------------------------------------- |
| `--series=RWTC,WCESTUS1` | Verified ids; unknown ids are rejected before any request |
| `--from=...`             | Period start in the series' own format                    |
| `--to=...`               | Period end, same format                                   |
| `--max-rows=5000`        | Rows per series across pages                              |
| `--page-size=5000`       | Rows per request; provider caps at 5000                   |
| `--write`                | Persist to `assets.*`; off by default                     |
| `--save-raw=false`       | Skip raw provider page artifacts                          |
| `--rpm=60`               | Requests per minute                                       |
| `--max-requests=120`     | Hard request budget for the run                           |
| `--output-dir=...`       | Default `collectors/assets/energy/data`                   |
| `--help`                 | Print usage                                               |

Defaults when `--from` is omitted: 730 days for daily series, 1,825 days for
weekly, 7,300 days for monthly. Period formats are validated locally, so a monthly
start can never be sent to a daily series.

Writes are transaction-per-series: one series cannot leave a partial asset behind,
and one failing series does not roll back the others.

## Output files

```text
eia series_catalog.json
eia observations_{SERIES}_{from}_{to|latest}.json
eia observations_raw_{SERIES}_{from}_{to|latest}.json
eia series_availability.json
```

`observations_*` holds normalized observations, rejections, provider totals,
warnings, page counts and truncation. `observations_raw_*` keeps the untouched
provider pages and redacted source URLs.

## Verification status

Verified end to end against the live database on 2026-10-27:

| Series                 | Frequency | Rows stored | Coverage                 |
| ---------------------- | --------- | ----------- | ------------------------ |
| `RWTC`                 | daily     | 496         | 2024-10-28 .. 2026-10-20 |
| `RBRTE`                | daily     | 502         | 2024-10-28 .. 2026-10-20 |
| `WCESTUS1`             | weekly    | 260         | 2021-10-29 .. 2026-10-16 |
| `WCRFPUS2`             | weekly    | 260         | 2021-10-29 .. 2026-10-16 |
| `WPULEUS3`             | weekly    | 260         | 2021-10-29 .. 2026-10-16 |
| `WGFUPUS2`             | weekly    | 260         | 2021-10-29 .. 2026-10-16 |
| `WDIUPUS2`             | weekly    | 260         | 2021-10-29 .. 2026-10-16 |
| `NW2_EPG0_SWO_R48_BCF` | weekly    | 260         | 2021-10-29 .. 2026-10-16 |
| `MCRFPUS2`             | monthly   | 237         | 2006-11 .. 2026-07       |
| `MCRIMUS2`             | monthly   | 237         | 2006-11 .. 2026-07       |
| `MCREXUS2`             | monthly   | 237         | 2006-11 .. 2026-07       |
| `N9070US2`             | monthly   | 237         | 2006-11 .. 2026-07       |
| `N9140US2`             | monthly   | 237         | 2006-11 .. 2026-07       |

Control checks after the write runs:

- 3,743 observations across 13 series; 3,743 distinct
  `(provider, series_id, frequency, period)` keys; 0 duplicate groups; 0 `NULL`
  values.
- A second identical `--mode=all --write` run inserted 0 observations, updated all
  3,743 in place, and created no duplicate asset or snapshot.
- Assets created: `RWTC`, `RBRTE`. Existing `BZUSD`, `GCUSD`, `SIUSD` were not
  touched. `assets.asset_price_history` still holds its previous 889 candles across
  3 assets, and no EIA asset has any row there.
- 2 `market_snapshot` rows (both asset-linked) and 11 `macro_context` rows (all
  `asset_id = NULL`).
- `--mode=readback` returns the rows above with their pinned units and cadences.

Monthly series end earlier than daily/weekly ones (`2026-07` vs `2026-10`). That is
the provider's publication lag for monthly petroleum and natural gas aggregates,
not a collection gap; the collector reports the actual last period rather than
forward-filling.

## Licensing and attribution

EIA data is published by the U.S. federal government and is generally not subject
to copyright in the United States, but that is not a blanket redistribution
license for every series or for derived displays. Before surfacing EIA-derived
series in user-facing features or a public API:

1. Re-read the current EIA API terms and any series-specific notes.
2. Confirm attribution expectations for derived charts and AI summaries.
3. Keep provider ids and units attached to every displayed value so consumers can
   trace it back.
4. Re-check after any change to the upstream data product.

Nothing in this collector asserts a redistribution right.

## Tests

```powershell
npx.cmd tsx tests/eia.normalization.test.ts
npx.cmd tsx tests/eia.repository.test.ts
```

- `eia.normalization.test.ts` — envelope parsing, string-to-number conversion,
  provider totals, period/frequency validation (including impossible dates), unit
  mismatch rejection, cross-series rejection, unusable-value rejection (never
  zeroed), negative values, ordering, duplicate collapsing, page merging, warning
  extraction, malformed payloads, empty results, catalog invariants, CLI argument
  validation and window resolution.
- `eia.repository.test.ts` — a behavioural fake of the narrow SQL surface,
  modelling the `series_observations` unique key, commodity `COALESCE` update and
  guarded snapshot insert. Covers asset creation/reuse, curated identity
  preservation, `external_ids` merging, observation idempotency, non-finite value
  dropping, fundamental rows with `asset_id = NULL`, the daily/weekly identity
  split, read-back, and the assertion that `asset_price_history` is never touched.
