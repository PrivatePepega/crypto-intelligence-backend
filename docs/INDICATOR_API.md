# Indicator Data API

These endpoints expose the global indicator catalogue and the data stored in the
`current` and `historical` schemas.

Both routes are **public** — they do not require a login or session cookie. No
`Authorization` header, user id, or `credentials: "include"` is needed.

---

## 1. List indicators

```http
GET /api-v1/indicators
```

Returns every active indicator, ordered by name.

```json
{
  "count": 106,
  "indicators": [
    {
      "id": "aaii_sentiment",
      "name": "AAII Investor Sentiment Survey",
      "seriesId": "aaii_sentiment",
      "domain": "Macroeconomics",
      "category": "Sentiment"
    }
  ]
}
```

Use `seriesId` as the stable key. The `name` is human-readable and may change;
`seriesId` is the database join key.

`id` is the catalogue id. The fetch endpoint accepts any of `name`, `seriesId`,
or `id`.

---

## 2. Fetch indicator data

```http
POST /api-v1/fetchData
Content-Type: application/json
```

Request:

```json
{
  "indicators": ["Bitcoin Spot ETF Market", "WTI", "DGS10-DGS2"],
  "from": "2025-01-01",
  "to": "2026-10-23",
  "historyLimit": 1000
}
```

| Field          | Required | Rules                                            |
| -------------- | -------- | ------------------------------------------------ |
| `indicators`   | yes      | 1–25 names, series ids, or catalogue ids         |
| `from`         | no       | `YYYY-MM-DD`; applies to historical rows only    |
| `to`           | no       | `YYYY-MM-DD`; applies to historical rows only    |
| `historyLimit` | no       | 1–10,000; newest N historical rows per indicator |

If `historyLimit` is omitted, all matching historical rows are returned. If
`from`/`to` are omitted, the full history is used. When `historyLimit` is set,
the newest N rows **inside the requested date range** are returned.

Response:

```json
{
  "requested": 3,
  "found": 3,
  "missing": [],
  "indicators": [
    {
      "indicator": {
        "id": "spot_etf_btc",
        "name": "Bitcoin Spot ETF Market",
        "seriesId": "spot_etf_btc",
        "domain": "Crypto",
        "category": "Spot ETF",
        "description": "...",
        "source": "...",
        "nativeTimeUnit": "day",
        "nativeFrequency": "Daily",
        "nativeAggregation": "sum",
        "unit": "USD",
        "use": "...",
        "purpose": "...",
        "significance": "...",
        "relationTags": ["..."],
        "status": "active"
      },
      "current": {
        "indicator": "btc_spot_etf",
        "series_id": "spot_etf_btc",
        "current_net_flow": 189844086.2,
        "current_net_assets": 108893049844.685,
        "observed_at": "2026-10-02",
        "updated_at": "2026-10-05T23:13:16.452Z"
      },
      "historical": [
        {
          "date": "2026-09-30",
          "series_id": "spot_etf_btc",
          "net_flow": -148687762.2,
          "net_assets": 107981652503.056
        }
      ],
      "currentTable": "btc_spot_etf",
      "historicalTable": "btc_spot_etf"
    }
  ]
}
```

### Data normalization

- `DATE` columns are returned as `YYYY-MM-DD` strings.
- Numeric database values are returned as JSON numbers.
- `TIMESTAMPTZ` columns are returned as ISO strings.
- Historical rows are ordered oldest to newest.
- `current` is the latest row from the current table, or `null`.
- `historical` is an array, possibly empty.

### Missing indicators

Unknown names are not a request failure. Valid entries still return data:

```json
{
  "requested": 2,
  "found": 1,
  "missing": ["not a real indicator"],
  "indicators": [
    {
      "indicator": {
        "name": "WTI Crude Oil",
        "seriesId": "WTI"
      },
      "current": {},
      "historical": [],
      "currentTable": "wti",
      "historicalTable": "wti"
    }
  ]
}
```

The real response includes the full metadata and data rows; only the shape is
shown here.

### No physical table

One active indicator is derived rather than stored in a table:

```text
10-Year / 2-Year Treasury Yield Spread
seriesId: DGS10-DGS2
```

It is returned by the catalogue and by the fetch endpoint, but with:

```json
{
  "current": null,
  "historical": [],
  "currentTable": null,
  "historicalTable": null
}
```

Treat that as “metadata only”, not as an error.

---

## 3. Frontend example

```ts
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

const response = await fetch(`${API_BASE_URL}/api-v1/fetchData`, {
  method: "POST",
  cache: "no-store",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    indicators: ["Bitcoin Spot ETF Market", "WTI"],
    from: "2025-01-01",
    historyLimit: 1000,
  }),
});

if (!response.ok) {
  const error = await response.json().catch(() => null);
  throw new Error(error?.message ?? `Request failed (${response.status})`);
}

const result = await response.json();
```

For charting, request a bounded `historyLimit` and/or date range. Without them,
a single long series can be large; WTI currently returns 9,512 historical rows.
