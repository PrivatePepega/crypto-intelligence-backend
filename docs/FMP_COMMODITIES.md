# FMP Commodity Market Data

Collector for commodity contract identity, current quotes and daily OHLC history
from Financial Modeling Prep (FMP).

Script: `collectors/assets/commodities/fmpCommodityFetchers.ts`

Output: `collectors/assets/commodities/data/` with a `fmp ` file prefix.

```powershell
npx.cmd tsx collectors/assets/commodities/fmpCommodityFetchers.ts --mode=all --symbols=GCUSD --write
```

FMP is the **source of the price observations**, not a source of canonical
commodity taxonomy. Provider symbols, prices, volumes and timestamps are stored
as reported. Classification (`commodity_type`, `benchmark`) is curated by this
collector and is labelled as such below.

## Endpoints

Base URL: `https://financialmodelingprep.com/stable`

| Purpose        | Request                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| Commodity list | `GET /commodities-list`                                                     |
| Single quote   | `GET /quote?symbol=GCUSD`                                                   |
| Batch quotes   | `GET /batch-commodity-quotes`                                               |
| Daily OHLC     | `GET /historical-price-eod/full?symbol=GCUSD&from=YYYY-MM-DD&to=YYYY-MM-DD` |

Only the three endpoints the collector actually uses are dependencies of this
module. Batch quotes are implemented by the provider but **not available on the
account used here** (HTTP 402), so nothing depends on them.

Configuration:

| Variable                  | Meaning                               |
| ------------------------- | ------------------------------------- |
| `FMP_API_KEY`             | Required. Never logged or persisted.  |
| `FMP_BASE_URL`            | Optional base URL override.           |
| `FMP_REQUESTS_PER_MINUTE` | Optional rate override (default 120). |

The API key is redacted from every URL this module logs or writes.

## Observed account access (2026-10-27)

Measured live with the configured key. This is a property of the **plan**, not of
the API, and it will change on upgrade.

| Endpoint                     | Result                                  |
| ---------------------------- | --------------------------------------- |
| `/commodities-list`          | 200, 40 contracts                       |
| `/quote`                     | 200 for 4 of 40 symbols                 |
| `/batch-commodity-quotes`    | 402 "Restricted Endpoint" – unavailable |
| `/historical-price-eod/full` | 200 for the 4 accessible symbols        |

Accessible symbols on this plan: **`GCUSD`** (gold), **`SIUSD`** (silver),
**`BZUSD`** (Brent) and **`ESUSD`** (E-mini S&P 500, an index future).

Plan-restricted symbols that the task targets: **`CLUSD`** (WTI),
`NGUSD` (natural gas), `HGUSD` (copper), `ALIUSD` (aluminum), plus
`PLUSD`, `PAUSD`, `MGCUSD` and `SILUSD`.

`CLUSD` is the WTI contract. There is **no alternative WTI symbol**: `WTIUSD`,
`CL` and `WTI` all return 402 as well. WTI support is implemented and covered by
fixture tests but **cannot be verified end to end on the current plan**. Gold is
used as the verified stand-in; see "Verification status".

`collectors/assets/commodities/data/fmp commodity_availability.json` is the
machine-readable record of the last probe (`--mode=availability`).

## HTTP status semantics

FMP returns plain text bodies for errors, even when `accept: application/json`
is sent.

| Status    | Meaning                                                   | Collector behavior                        |
| --------- | --------------------------------------------------------- | ----------------------------------------- |
| 200       | Success. JSON array, possibly empty.                      | Normalize; empty is a valid empty result. |
| 402       | Not covered by the subscription — **endpoint or symbol**. | `RESTRICTED`; never "no data".            |
| 401 / 403 | Missing or invalid key.                                   | `unauthorized`; abort the symbol.         |
| 429       | Rate limit.                                               | Retry with `Retry-After`/backoff.         |
| 5xx       | Provider fault.                                           | Retry up to 3 attempts.                   |
| timeout   | 20 s per request.                                         | Retry, then fail.                         |

The important consequence: **402 is ambiguous.** FMP uses it both for a
restricted endpoint and for an unknown symbol, so a 402 is reported as
`RESTRICTED` and is never collapsed into an empty result. Only a real `200 []`
means "no rows for this window".

Request control: a per-process rate limit (default 120 rpm), a hard request
budget (`--max-requests`, default 100), and bounded retries. The account quota is
small (~250 requests/day), so keep the budget conservative.

## Commodity list

`/commodities-list` is authoritative for symbols. Nothing in this collector
guesses a ticker: a symbol that is not in the provider list is rejected with
`symbol is not present in /commodities-list`.

Observed shaping notes:

- `exchange` is `null` for many contracts.
- `tradeMonth` is the front month label (`"Dec"`), not a full date.
- Some rows use a `USX` currency code rather than `USD`; both are stored as
  reported.
- Aluminum is **`ALIUSD`**. `ALUUSD` is not listed. Any code or config that uses
  `ALUUSD` is wrong.
- The list mixes physical commodities with financial futures (Treasuries, index
  futures, Fed Funds). Those are ingestible but classified separately.

## Targets and symbol map

| Symbol   | Provider name      | Curated type          | Curated benchmark | Access on this plan |
| -------- | ------------------ | --------------------- | ----------------- | ------------------- |
| `GCUSD`  | Gold Futures       | `precious_metal`      | COMEX gold        | yes                 |
| `SIUSD`  | Silver Futures     | `precious_metal`      | COMEX silver      | yes                 |
| `CLUSD`  | Crude Oil (WTI)    | `energy`              | WTI               | **402**             |
| `BZUSD`  | Brent Crude Oil    | `energy`              | Brent             | yes                 |
| `NGUSD`  | Natural Gas        | `energy`              | Henry Hub         | **402**             |
| `HGUSD`  | Copper             | `base_metal`          | COMEX copper      | **402**             |
| `ALIUSD` | Aluminum Futures   | `base_metal`          | Aluminum          | **402**             |
| `PLUSD`  | Platinum           | `precious_metal`      | NYMEX platinum    | **402**             |
| `PAUSD`  | Palladium          | `precious_metal`      | NYMEX palladium   | **402**             |
| `MGCUSD` | Micro Gold Futures | `precious_metal`      | –                 | **402**             |
| `SILUSD` | Micro Silver       | `precious_metal`      | –                 | **402**             |
| `ESUSD`  | E-Mini S&P 500     | `equity_index_future` | S&P 500           | yes                 |

`ESUSD` is accessible but is **not** a physical commodity, so it is never
persisted by the default run and must not be aggregated with supply/demand
metrics.

Provenance rules:

- FMP's own label for `CLUSD` is "Crude Oil"; this collector calls it
  "Crude Oil (WTI)" because a future-month value is the WTI benchmark contract.
  The provider name is kept verbatim in `external_ids.fmp.name`.
- `commodity_type` / `benchmark` are collector-curated taxonomy, not provider
  claims. They exist because the schema has columns for them and because
  grouping by energy/precious/base metal is useful. They are stable
  classification, never price data.
- `unit_of_measure` is deliberately **NULL**. FMP does not document contract
  size or units, so writing "troy ounce" or "barrel" would invent metadata.
- Unknown symbols keep provider identity and receive `NULL` classification
  instead of a guessed type.

## Normalization rules

Provider data is untrusted and validated per row, so one malformed row cannot
discard a response.

- Unknown, absent or unmodelled values become `null` — never `0`, never `false`.
- **Negative prices are preserved.** WTI settled at **-37.63 on 2020-04-20**; a
  positivity check would corrupt real history.
- Negative or missing volume becomes `null`. Zero volume stays `0`.
- A quote without a finite price is rejected, not stored as `0`.
- A quote whose echoed symbol differs from the requested symbol is rejected.
- Candles are only built from provider OHLC rows. **No candle is ever
  synthesized from a scalar quote price.**
- Candle sanity checks: date must be a real calendar day, OHLC must be finite,
  `high >= low`, and open/close must fall inside `[low, high]`. Rejected rows are
  counted and listed, not silently dropped.
- Duplicate trading dates within a response are collapsed and counted.

### Dates and timestamps

The provider's daily `date` (`YYYY-MM-DD`) is **timezone-free**. It is stored as
`<date>T00:00:00.000Z` and documented as _the exchange trading session for that
calendar date_. It is not a UTC day boundary; do not convert it to a local day.

Quote `timestamp` is unix **seconds**. It is converted to ISO and stored as
`observed_at`. When the provider omits it, `observed_at` stays `NULL` rather
than borrowing `collected_at`.

### History coverage and chunking

- Range requests are inclusive of both `from` and `to`.
- A single request is capped at **5,000 rows**. Asking for 2000→today returned
  exactly 5,000 rows covering 2007-08-02 .. 2026-10-27 — i.e. silently truncated.
- Omitting `from`/`to` returns roughly 5 years (1,330 rows observed).
- Weekends and holidays return `200 []`, which is a valid empty result.
- Because of the cap, ranges are split into `--chunk-days` windows (default 365)
  and merged. Overlaps are deduplicated by trading date.

## Database mapping

All writes are opt-in (`--write`); the default run is a dry run and only writes
JSON artifacts.

| Table                        | Content                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `assets.assets`              | Canonical row, `asset_type = 'commodity'`, provider ids in `external_ids.fmp` |
| `assets.commodities`         | `commodity_type`, `benchmark`, `currency`; `unit_of_measure` stays NULL       |
| `assets.asset_price_history` | Daily OHLC, `interval = '1d'`, `quote_currency` from the provider             |
| `assets.information`         | `information_type = 'market_snapshot'`, `source = 'fmp'`                      |

Identity:

- `assets.symbol` is the **provider symbol** (`GCUSD`), not an invented ticker
  such as `XAU`. Mapping a futures contract onto a spot ticker asserts a
  relationship the provider never stated.
- `assets.assets` has **no** unique constraint on `(symbol, asset_type)`, and
  this collector must not alter the schema. Identity is resolved with a lookup
  before insert, inside the caller's transaction: match on `symbol` or on
  `external_ids->'fmp'->>'symbol'`.
- Existing `symbol` and `name` are **never overwritten**. Only
  `external_ids.fmp` is merged, so manually curated identity survives re-runs.
- `assets.commodities` upserts with `COALESCE`, so a `NULL` classification from
  an uncurated symbol can never erase stored curated values.

Candles:

- Inserted with the existing `UNIQUE (asset_id, interval, "timestamp")` key, so
  a re-run updates in place instead of duplicating.
- Batched (200 rows per statement) and deduplicated by timestamp first.
- `quote_currency` is provider-reported and kept on update if the new value is
  null.

Snapshots:

- `assets.information` has no unique key, so idempotency comes from a guarded
  insert: `WHERE NOT EXISTS (... data->>'snapshot_key' = $6)`.
- `snapshot_key = "fmp:<symbol>:<observed_at ?? collected_at>"`. A new provider
  timestamp is a genuinely new observation; the same observation is a no-op.
- The `data` payload carries `provider`, `provider_symbol`, `price`, OHLC-ish
  daily fields, `volume`, `volume_unit: null`, `observed_at`, `collected_at` and
  an explicit `limitations` array.

Both writes happen in one transaction, so an asset is never created without its
metadata row.

## CLI

| Mode           | Output                                                  |
| -------------- | ------------------------------------------------------- |
| `catalog`      | `/commodities-list` snapshot plus default-target report |
| `quote`        | Current quote per symbol                                |
| `history`      | Daily OHLC artifacts per symbol                         |
| `all`          | catalog + quote + history, and DB writes with `--write` |
| `availability` | Which symbols the current plan can quote                |
| `readback`     | Read stored rows back (read-only)                       |

| Option                  | Meaning                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `--symbols=GCUSD,SIUSD` | Provider symbols; defaults to the seven task commodities    |
| `--from=YYYY-MM-DD`     | History start (default: `--days` before `--to`)             |
| `--to=YYYY-MM-DD`       | History end (default: today, UTC)                           |
| `--days=365`            | Window length when `--from` is omitted                      |
| `--chunk-days=365`      | Days per history request; keep well under the 5,000-row cap |
| `--write`               | Persist to `assets.*`; off by default                       |
| `--save-raw=false`      | Skip the raw provider rows in artifacts                     |
| `--probe`               | With `--mode=catalog`, also probe quote access              |
| `--rpm=120`             | Requests per minute                                         |
| `--max-requests=100`    | Hard request budget for the run                             |
| `--output-dir=...`      | Default `collectors/assets/commodities/data`                |
| `--help`                | Print usage                                                 |

Exit code is non-zero only for unexpected failures. Plan restrictions are
reported as `RESTRICTED` and do not fail the run.

## Output files

```text
fmp commodities_list.json
fmp commodity_quote_{SYMBOL}.json
fmp commodity_history_{SYMBOL}_{from}_{to}.json
fmp commodity_history_raw_{SYMBOL}_{from}_{to}.json
fmp commodity_availability.json
```

`*_history_*` holds normalized candles and the per-window row counts (so a
truncated window is visible). `*_history_raw_*` keeps the untouched provider rows.

## Verification status

Verified end to end against the live database on 2026-10-27:

| Symbol  | Candles (1y) | Asset   | Snapshot |
| ------- | ------------ | ------- | -------- |
| `GCUSD` | 296          | created | yes      |
| `SIUSD` | 296          | created | yes      |
| `BZUSD` | 297          | created | yes      |

- A second identical run inserted 0 candles and updated the same 296/297 rows,
  with no duplicate assets and no duplicate snapshot for the same observation.
- Idempotency was additionally checked against the real schema inside a
  rolled-back transaction: second identical snapshot skipped, second identical
  candle updated, no candle duplication, missing volume stayed `NULL`, and the
  rollback left no net rows.
- `--mode=readback` shows 296 candles spanning
  `2025-10-28T00:00:00.000Z .. 2026-10-27T00:00:00.000Z`, profile
  `precious_metal` / `COMEX gold` / `USD` / `unit_of_measure: null`.
- Restriction handling confirmed live for `CLUSD,NGUSD,HGUSD,ALIUSD` → each is
  reported `RESTRICTED: HTTP 402 …` with exit code 0 and no database write.

Not verified, and not claimed: WTI, natural gas, copper, aluminum, platinum,
palladium and the micro contracts, because the current plan returns 402 for all
of them. Their code paths are covered by fixture tests only. `ESUSD` is
collected but is an index future, not a physical commodity.

## Licensing and redistribution

An FMP subscription grants API access; it **does not automatically grant the
right to publicly redistribute or display the data**. Before any FMP-derived
price, OHLC series or snapshot is shown to end users or exposed through a public
API:

1. Re-read the current FMP terms of service and the plan's display/redistribution
   terms.
2. Confirm that derived displays (charts, summaries, AI explanations) are
   permitted, not just storage.
3. Check any attribution requirement.
4. Re-check after every plan change, since entitlements and terms change with it.

Until that review is recorded, treat stored FMP commodity data as internal
intelligence and do not surface it in user-facing features. Nothing in this
collector asserts a redistribution right.

## Tests

```powershell
npx.cmd tsx tests/fmpCommodity.normalization.test.ts
npx.cmd tsx tests/fmpCommodity.repository.test.ts
```

- `fmpCommodity.normalization.test.ts` — date validation, UTC-midnight mapping,
  unix-second handling, currency normalization, list dedupe, quote rejection,
  negative prices, missing volume, OHLC sanity checks, duplicate collapsing,
  window splitting, range validation, failure classification and key redaction.
- `fmpCommodity.repository.test.ts` — a behavioral fake of the narrow SQL
  surface, modelling the real unique key and the guarded snapshot insert. Covers
  asset reuse, curated-name preservation, `external_ids` merging, candle
  idempotency, snapshot idempotency, new-observation detection and `COALESCE`
  protection of curated metadata.
