# Stock Intelligence API

Single endpoint: `GET /api-v1/stocks/:ticker`

Query parameters:

| Parameter  | Meaning                                                     |
| ---------- | ----------------------------------------------------------- |
| `refresh`  | `true` forces every dataset to be re-collected.              |
| `readOnly` | `true` returns persisted data without contacting providers.  |

## Four layers, kept separate

| Layer                | Where                                              | Purpose                                                        |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Normalized domain    | `types/stocks/stock.types.ts`                      | Provider-agnostic business shapes used by collectors/services.  |
| Persistence          | `database/sql/assets/01-assets.sql` + `stockRepository.ts` | Canonical rows and JSONB columns.                       |
| Collection run       | `CollectionMetadata` in `types/stocks/api.types.ts`| Coverage, per-dataset outcome, warnings, errors.               |
| API response         | `StockIntelligenceResponse` in `types/stocks/api.types.ts` | Stable frontend contract.                                |

`toApiResponse()` drops the raw coverage report and exposes
`collectionMetadata` as `metadata`. Diagnostics are never written to
`assets.assets` or `assets.stocks`.

## Persistence mapping

| Response field                       | Storage                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `identity.assetId`                   | `assets.assets.id` (canonical UUID, created before any ingestion)       |
| `identity.providerIds`               | `assets.assets.external_ids` (the only place provider IDs are stored)   |
| `profile.website`                    | `assets.assets.website_url`                                             |
| `profile.description`                | `assets.stocks.business_summary`                                        |
| `profile.exchange/sector/industry`   | `assets.stocks` columns                                                 |
| `quote`                              | latest `assets.information` row with `information_type = 'market_snapshot'` |
| `history.candles`                    | `assets.asset_price_history` (`interval = '1d'`)                        |
| `financialStatements`                | `assets.stocks.financial_statements` (JSONB)                            |
| `financialMetrics`                   | `assets.stocks.financial_metrics` (JSONB)                               |
| `insiderTransactions`                | `assets.information` events, `source = 'sec_insider'`                   |
| `institutionalHoldings`              | `assets.information` events, `source = 'sec_13f'`                       |
| `beneficialOwnership`                | `assets.information` events, `source = 'sec_13dg'`                      |
| `corporateActions`                   | `assets.information` events, `source = 'sec_corporate_action'`          |

Event dedupe keys:

- `insider:{accessionNumber}:{lineNumber}:{table}`
- `13f:{managerCik}:{reportPeriod}:{accessionNumber}`
- `13dg:{accessionNumber}`
- `corp_action:{accessionNumber}`

Only normalized records are persisted. A 13D/G or corporate-action filing whose
AI extraction was skipped or failed is reported under `metadata.errors` and
retried on a later run; it is not stored as an empty event.

`quote.providerRaw` is not persisted and is not part of the API contract.
History range requests and rejected/duplicate candle counts are run metadata
and are not exposed in `history`.

## Response metadata

```jsonc
{
  "metadata": {
    "requestedAt": "2026-10-29T13:55:38.000Z",
    "durationMs": 2100,
    "refresh": false,
    "readOnly": true,
    "coverage": { "assetId": "...", "overallFresh": true, "datasets": [] },
    "datasets": [
      {
        "dataset": "history",
        "status": "success", // success | partial | failed | skipped
        "recordsAvailable": 253,
        "recordsCollected": 1,
        "message": "..."
      }
    ],
    "warnings": [],
    "errors": []
  }
}
```

- `recordsAvailable` counts normalized records currently readable (periods,
  candles, events), calculated **after** persistence.
- `recordsCollected` is present only when the dataset ran in this request.
- `status: "partial"` means the collector returned some data but reported
  errors for part of the dataset; the partial data is still persisted.

HTTP behaviour:

- `200` for success and partial success (same payload shape).
- `502` with `ingestion_failed` only when every core dataset is unavailable and
  at least one collection error occurred. The diagnostics are still included.

Event arrays are capped at the 200 most recent records. The persisted total is
reported in `metadata.datasets[].recordsAvailable`.

`history.candles` holds the 30 most recent daily candles. `effectiveFrom` and
`effectiveTo` are the dates of the first and last candle in that window, and
`change`/`changePercent` are `null` for the first candle because the previous
close falls outside the window.

## Operational notes

- A failing collector never aborts the request: collectors are wrapped, partial
  results are persisted, and the failure is recorded per dataset.
- SEC HTTP requests time out after 30 seconds.
- AI extraction calls time out after 60 seconds. After two consecutive
  extraction failures (for example an exhausted model quota), the collector
  stops calling the model for the rest of that run and keeps deterministic
  filing metadata only.
- 13F holdings come from locally cached `Edgar 13f_CIK*.json` files, filtered
  by CUSIP. 13F is filed by the manager, so each stored period carries
  `managerCik` and `managerName`.
- Response payloads are logged to `collectors/assets/data/` as
  `stocks_intelligence_{ticker}_{timestamp}.json` (or `_partial_`, `_error_`,
  `_exception_`).
