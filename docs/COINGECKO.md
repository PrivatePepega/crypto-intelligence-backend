# CoinGecko Asset Intelligence

Collector for the CoinGecko REST API v3: asset discovery, core metadata,
contract mappings, supply, current market metrics, historical observations and
OHLC candles.

Script: `collectors/assets/crypto/coingeckoFetchers.ts`

Output: `collectors/assets/crypto/data/` with a `coingecko ` file prefix.

```powershell
npx.cmd tsx collectors/assets/crypto/coingeckoFetchers.ts --mode=all --ids=bitcoin,ethereum
```

## Authentication and request limits

Base URL: `https://api.coingecko.com/api/v3`

The Demo key is read from `COINGECKO_API_KEY` and sent in the
`x-cg-demo-api-key` **header**, never as the `x_cg_demo_api_key` query
parameter. This keeps the secret out of logged URLs, `sourceUrl` fields and
error messages. Without a key the public endpoints still work at stricter
unauthenticated limits, and the collector warns once.

| Behavior        | Default                                                      |
| --------------- | ------------------------------------------------------------ |
| Request rate    | 30 requests/minute (2 s minimum gap), matching the Demo plan |
| Timeout         | 30 s per request                                             |
| Retries         | 429 and 5xx, up to 4 attempts                                |
| Backoff         | `Retry-After` when present, otherwise exponential (2 s base) |
| Market batching | 250 ids per `/coins/markets` request                         |

`COINGECKO_REQUESTS_PER_MINUTE` or `--rpm` can lower the rate. Raising it is
only safe on a plan with a higher quota; a 429 is retried but still costs time.

## Demo-plan limits

Observed against the live API on 2026-10-27:

| Endpoint / range            | Observed behavior                                                |
| --------------------------- | ---------------------------------------------------------------- |
| `/key`                      | HTTP 401 - Pro API subscribers only                              |
| `/coins/list`               | About 22,500 coins, about 21,700 with platform/contract mappings |
| `/coins/markets`            | At most 250 ids per request                                      |
| `/market_chart?days=1`      | 5-minute observations                                            |
| `/market_chart?days=2-30`   | 1-hour observations                                              |
| `/market_chart?days=31-365` | 1-day observations                                               |
| `/market_chart?days>365`    | HTTP 401 - restricted by the Demo plan                           |
| `/ohlc?days=1-2`            | 30-minute candles                                                |
| `/ohlc?days=3-30`           | 4-hour candles                                                   |
| `/ohlc?days=31-365`         | 4-day candles                                                    |
| `/ohlc?days>365`            | HTTP 401 - restricted by the Demo plan                           |

Granularity is inferred from the returned timestamps rather than assumed from
the `days` argument. If CoinGecko changes a range's spacing, the output shows
the actual observed interval. `--max-history-days` rejects an over-long range
before a request is spent; it defaults to 365.

## Modes and options

| Mode       | Endpoint(s)                                                                              |
| ---------- | ---------------------------------------------------------------------------------------- |
| `ping`     | `/ping`                                                                                  |
| `discover` | `/coins/list?include_platform=true`                                                      |
| `search`   | `/search?query=...`                                                                      |
| `coin`     | `/coins/{id}` with market and community data                                             |
| `markets`  | `/coins/markets`, batched by 250 ids                                                     |
| `chart`    | `/coins/{id}/market_chart`                                                               |
| `ohlc`     | `/coins/{id}/ohlc`                                                                       |
| `all`      | `discover` + `coin` + `markets` + `chart` + `ohlc` (plus `search` when `--query` is set) |

| Option                   | Meaning                                              |
| ------------------------ | ---------------------------------------------------- |
| `--mode=all`             | Mode; defaults to `all`                              |
| `--ids=bitcoin,ethereum` | Stable CoinGecko ids, **not** ticker symbols         |
| `--query=ethereum`       | Search term for `search`, or the extra step in `all` |
| `--vs=usd`               | Quote currency (default `usd`)                       |
| `--chart-days=365`       | `market_chart` range (default 365)                   |
| `--ohlc-days=30`         | OHLC range (default 30)                              |
| `--days=30`              | Shorthand that sets both chart and OHLC ranges       |
| `--max-history-days=365` | Hard ceiling for either history range                |
| `--batch-size=250`       | `/coins/markets` ids per request (maximum 250)       |
| `--rpm=30`               | Requests per minute                                  |
| `--output-dir=...`       | Default `collectors/assets/crypto/data`              |
| `--platforms=false`      | Omit platform mappings from `discover`               |
| `--help`                 | Print usage                                          |

Each step is independent: one failure is reported, the remaining steps still
run, and the process exits non-zero if any step failed.

## Output files

```text
coingecko coins_list.json
coingecko search_{query}.json
coingecko coin_{id}.json
coingecko markets_{ids}.json
coingecko market_chart_{id}_{days}d.json
coingecko ohlc_{id}_{days}d.json
```

Files contain normalized records, not the raw provider payload. Long id lists
and unusual query strings are sanitized or replaced with a short hash in file
names. The provider's full `/coins/list` payload is about 4 MB; the normalized
file keeps only the id, symbol, name and contract mappings but is still several
megabytes because it covers every listed asset.

## Normalized records

### Asset and crypto

`coin_{id}.json` contains:

- `asset`: maps to `assets.assets` - `name`, `symbol`, `asset_type = 'crypto'`,
  `description`, `category` (first CoinGecko category), `logo_url`,
  `website_url`, and `external_ids`:
  ```json
  { "coingecko_id": "ethereum", "other_provider_ids": {} }
  ```
- `crypto`: maps to `assets.crypto` - `network`, `contract_addresses`,
  `circulating_supply`, `total_supply`, `max_supply`, `tokenomics`, `socials`.
- `market`: current price, market cap, fully diluted valuation, rank, volume,
  total value locked, 24 h high/low and change, 7 d/30 d changes, ATH/ATL with
  dates and percentages, supply fields and `last_updated`.
- `marketSnapshot`: one `assets.information` record with
  `information_type = 'market_snapshot'`.
- `resolution`: `{ "provider": "CoinGecko", "method": "provider_id",
"verified": false }`.

Descriptions are HTML in the provider response. They are converted to plain
text: scripts/styles and tags are removed, entities decoded and whitespace
collapsed. Provider text is untrusted display data.

Contract mappings are `{ network, address, decimalPlace, source: "CoinGecko",
verified: false }`. Empty native-platform entries are ignored.

### Market snapshots

`markets_{ids}.json` has one `{ asset, information }` pair per returned row.
`information.data` contains the snapshot metrics and the quote currency.
`missingIds` lists requested ids the provider did not return, so a delisted or
mistyped id is visible rather than silently absent.

`information` records carry:

- `source: "CoinGecko"`
- `sourceUrl` (no API key)
- `observedAt`: the provider's `last_updated` when present
- `collectedAt`: when this collector fetched the response
- `publishedAt: null`

### Discovery and search

`coins_list.json` keeps `coingeckoId`, `symbol`, `name` and platform/contract
mappings, deduplicated by id. `search_{query}.json` keeps candidates in provider
order with `method: "search_candidate"` and `verified: false`.

### Historical observations

`market_chart_{id}_{days}d.json` joins the price, market-cap and volume series
on their millisecond timestamp. Missing points stay `null`; they are not
interpolated.

### OHLC candles

`ohlc_{id}_{days}d.json` contains
`{ timestamp, open, high, low, close, volume: null, quoteCurrency, interval }`.
Malformed rows and impossible candles are rejected and counted in
`rejectedRows`; they are not corrected. Duplicate timestamps keep the last row.

## Database mapping

The collector writes JSON only. A downstream writer is responsible for
upserts and for preserving manual overrides.

| Target                       | Source                                               |
| ---------------------------- | ---------------------------------------------------- |
| `assets.assets`              | `asset` from `coin_{id}.json`                        |
| `assets.assets.external_ids` | `{ "coingecko_id": ..., "other_provider_ids": {} }`  |
| `assets.crypto`              | `crypto` from `coin_{id}.json`                       |
| `assets.information`         | `marketSnapshot`, or each `information` in `markets` |
| `assets.asset_price_history` | OHLC candles with a non-null mapped `interval`       |

`asset_price_history.interval` accepts only `1m`, `5m`, `15m`, `1h`, `4h`,
`1d`, `1w`, `1mo`. CoinGecko's 4-hour candles map directly. Its 30-minute and
4-day candles do not, so they are emitted with `interval: null` and must not be
resampled into a different interval.

## Identity and evidence rules

- The stable CoinGecko id is the lookup key. Ticker symbols are not unique.
- A search result is a candidate, never proof of identity. Resolve the id and
  fetch `/coins/{id}` before treating it as the asset.
- `verified` is always `false`: the collector has not checked contract
  addresses on-chain or confirmed that provider metadata matches a canonical
  identity by another source.
- Never overwrite a manually verified contract address or identity with a
  provider-reported match.
- Keep `sourceUrl`, `observedAt` and `collectedAt` so changing metadata remains
  attributable and time-stamped.
- The API key is never written to output or included in error URLs.

## OHLC versus market-chart data

`/market_chart` returns observations, not candles. Its output has
`granularity.isOhlc = false`, `assetPriceHistoryInterval = null`, and a note
saying not to insert the rows into `assets.asset_price_history`.

CoinGecko OHLC supplies no volume. `volume` is always `null` and must not be
derived from price or market-cap observations.

Do not manufacture candles from single observations or resample the provider's
intervals.

## Verification

```powershell
npx.cmd prettier --check "collectors/assets/crypto/coingeckoFetchers.ts"
npx.cmd tsx tests/coinGecko.normalization.test.ts
npx.cmd tsx collectors/assets/crypto/coingeckoFetchers.ts --mode=discover
```

The normalization tests cover description cleanup, contract/platform mapping,
socials, market metrics, profile assembly, market rows, list/search dedupe,
interval inference and the OHLC/chart separation. Live runs depend on the
Demo key and quota.
