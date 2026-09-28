import { readFileSync } from "node:fs";

import {
  CMC_MARKET_METRICS,
  CMC_MARKET_METRICS_MA_PERIOD,
  CMC_MARKET_METRICS_SERIES_ID,
  buildCmcMarketMetricsInsert,
} from "../database/injection/config/coinmarketcapMarketMetrics.js";

const cols = (p: string) =>
  [
    ...readFileSync(new URL(p, import.meta.url), "utf-8").matchAll(
      /^\s{4}(\w+) (NUMERIC|DATE|TEXT|TIMESTAMPTZ|INTEGER)/gm,
    ),
  ].map((m) => m[1]!);

const tableCols = cols(
  "../database/sql/current/coinmarketcapGeneralCryptoMetric.sql",
);
const histCols = cols(
  "../database/sql/historical/coinmarketcapGeneralCryptoMetric.sql",
);

const metrics = CMC_MARKET_METRICS;

console.log(`metrics in contract        : ${metrics.length}`);
console.log(`MA period                 : ${CMC_MARKET_METRICS_MA_PERIOD}`);
console.log(`table columns             : ${tableCols.length}`);

// Every metric carries the full six-column set, including the three
// *_24h_percentage_change metrics.
const complete = metrics.filter(
  (m) =>
    m.netChangeColumn !== "" &&
    m.percentChangeColumn !== "" &&
    m.movingAverageColumn !== "" &&
    m.currentVsMovingAverageColumn !== "",
);
console.log(`metrics with all 6 columns : ${complete.length}`);
console.log(
  `\n0. all ${metrics.length} metrics have all six columns: ${
    complete.length === metrics.length ? "PASS" : "FAIL"
  }`,
);

// Build the INSERT with empty values; only the column list matters here.
const { columns, values } = buildCmcMarketMetricsInsert(
  {},
  {},
  { source: "x", observedAt: "y" },
);

console.log(`\ngenerated INSERT columns  : ${columns.length}`);

const unknown = columns.filter((c) => !tableCols.includes(c));
console.log(
  `1. every generated column exists in the table: ${unknown.length === 0 ? "PASS" : `FAIL ${unknown.join(", ")}`}`,
);

// The silent-failure direction: a column the injector never writes stays NULL.
const omitted = tableCols.filter((c) => !columns.includes(c));
console.log(
  `2. only updated_at left unwritten (DEFAULT NOW()): ${
    omitted.length === 1 && omitted[0] === "updated_at"
      ? "PASS"
      : `FAIL omitted=[${omitted.join(", ")}]`
  }`,
);

console.log(
  `3. columns/values lengths match: ${columns.length === values.length ? "PASS" : `FAIL ${columns.length} vs ${values.length}`}`,
);

console.log(
  `\n4. no duplicate generated column: ${
    new Set(columns).size === columns.length ? "PASS" : "FAIL"
  }`,
);

// The three metrics that previously had no change columns now have them.
const pctChange = metrics.filter((m) => m.key.endsWith("24hPercentageChange"));
console.log(`\n5. percentage-change metrics: ${pctChange.map((m) => m.key).join(", ")}`);
console.log(
  `   all now have net + percent change columns: ${
    pctChange.every((m) => m.netChangeColumn && m.percentChangeColumn)
      ? "PASS"
      : "FAIL"
  }`,
);
console.log(
  `   and those columns exist in the table: ${
    pctChange.every(
      (m) =>
        tableCols.includes(m.netChangeColumn) &&
        tableCols.includes(m.percentChangeColumn),
    )
      ? "PASS"
      : "FAIL"
  }`,
);

// Every metric must name a real historical column, or the SELECT fails.
const badHist = metrics.filter((m) => !histCols.includes(m.historicalColumn));
console.log(
  `\n6. every historicalColumn exists in the historical table: ${
    badHist.length === 0 ? "PASS" : `FAIL ${badHist.map((m) => m.historicalColumn).join(", ")}`
  }`,
);

const distHist = new Set(metrics.map((m) => m.historicalColumn));
console.log(
  `7. each metric reads a distinct historical column: ${
    distHist.size === metrics.length ? "PASS" : "FAIL"
  }`,
);

const distKey = new Set(metrics.map((m) => m.key));
console.log(
  `8. each metric has a distinct key: ${distKey.size === metrics.length ? "PASS" : "FAIL"}`,
);

// seriesId must match the indicator metadata or the FK rejects every insert.
const meta = readFileSync(
  new URL(
    "../database/injection/indicators/coinmarketcapcryptomarketmetrics.ts",
    import.meta.url,
  ),
  "utf-8",
);
const expected = meta.match(/seriesId: "([^"]+)"/)![1]!;
console.log(
  `\n9. SERIES_ID matches indicator metadata: ${
    CMC_MARKET_METRICS_SERIES_ID === expected ? "PASS" : `FAIL ${CMC_MARKET_METRICS_SERIES_ID} vs ${expected}`}`,
);

console.log(
  `\n10. indicator PK equals the current table name: ${
    columns[0] === "indicator" ? "PASS (indicator)" : "FAIL"
  }`,
);

// Group counts must reconcile to the table.
const counts = {
  current: columns.filter((c) => c.startsWith("current_") && !c.startsWith("current_vs_")).length,
  previous: columns.filter((c) => c.startsWith("previous_day_")).length,
  net: columns.filter((c) => c.endsWith("_net_change")).length,
  pct: columns.filter((c) => c.endsWith("_percent_change")).length,
  ma: columns.filter((c) => c.startsWith("moving_average_30d_")).length,
  vs: columns.filter((c) => c.startsWith("current_vs_30d_ma_")).length,
};
console.log(`\n11. generated group counts: ${JSON.stringify(counts)}`);
console.log(
  `    every group is the full metric set (${metrics.length}): ${
    Object.values(counts).every((n) => n === metrics.length) ? "PASS" : "FAIL"
  }`,
);
console.log(
  `    arithmetic 2+${counts.current}+${counts.previous}+${counts.net}+${counts.pct}+${counts.ma}+${counts.vs}+2 = ${
    2 + counts.current + counts.previous + counts.net + counts.pct + counts.ma + counts.vs + 2
  } (actual ${columns.length})`,
);
console.log(
  `    table has exactly one more column (updated_at): ${
    tableCols.length === columns.length + 1 ? "PASS" : "FAIL"
  }`,
);
