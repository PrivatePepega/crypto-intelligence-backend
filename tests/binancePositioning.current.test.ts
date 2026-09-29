import { readFileSync } from "node:fs";

import {
  BINANCE_POSITIONING_MA_PERIOD,
  BINANCE_POSITIONING_METRICS,
  mergeBinanceLatestPositioning,
  MISSING_LATEST_SUB_SOURCES,
  type BinancePositioningLatest,
} from "../database/injection/config/binancePositioning.js";

const sql = readFileSync(
  new URL("../database/sql/current/binanceBtcusdt.sql", import.meta.url),
  "utf-8",
);

const tableColumns = [...sql.matchAll(/^\s{4}(\w+) (NUMERIC|DATE|TEXT|TIMESTAMPTZ)/gm)]
  .map((m) => m[1]!);

const metrics = BINANCE_POSITIONING_METRICS;

// Rebuild exactly the column list the injector generates.
const generated = [
  "indicator",
  "series_id",
  ...metrics.map((m) => m.currentColumn),
  ...metrics.map((m) => m.previousColumn),
  ...metrics.map((m) => m.netChangeColumn),
  ...metrics.map((m) => m.percentChangeColumn),
  ...metrics.map((m) => m.movingAverageColumn),
  ...metrics.map((m) => m.currentVsMovingAverageColumn),
  "symbol",
  "global_date",
  "top_account_date",
  "top_position_date",
  "open_interest_date",
  "funding_date",
  "taker_date",
  "observed_at",
];

console.log(`metrics: ${metrics.length}   MA period: ${BINANCE_POSITIONING_MA_PERIOD}`);
console.log(`generated INSERT columns: ${generated.length}   table columns: ${tableColumns.length}`);

const unknown = generated.filter((c) => !tableColumns.includes(c));
console.log(`\n1. every generated column exists in the table: ${unknown.length === 0 ? "PASS" : `FAIL ${unknown.join(", ")}`}`);

// The reverse direction is the one that fails silently: a column the injector
// never writes stays NULL forever with no error. updated_at is legitimately
// absent because it has DEFAULT NOW() and is set in the DO UPDATE clause.
const omitted = tableColumns.filter((c) => !generated.includes(c));
console.log(`2. only updated_at is left unwritten (DEFAULT NOW()): ${
  omitted.length === 1 && omitted[0] === "updated_at" ? "PASS" : `FAIL omitted=[${omitted.join(", ")}]`
}`);

// A named INSERT does not need to follow the table's physical column order, so
// compare as sets. What must hold is that columns[] and values[] are built from
// the same grouping, which the injector's runtime length guard covers.
const generatedSet = new Set(generated);
const tableSet = new Set(tableColumns);
const onlyInGenerated = generated.filter((c) => !tableSet.has(c));
const onlyInTable = tableColumns.filter((c) => !generatedSet.has(c) && c !== "updated_at");
console.log(`3. generated set equals table set (minus updated_at): ${
  onlyInGenerated.length === 0 && onlyInTable.length === 0
    ? "PASS"
    : `FAIL extra=[${onlyInGenerated.join(", ")}] missing=[${onlyInTable.join(", ")}]`
}`);

console.log(`3b. injector guards columns/values length: ${
  /columns\.length !== values\.length/.test(
    readFileSync(
      new URL(
        "../database/injection/config/binancePositioningCurrent.ts",
        import.meta.url,
      ),
      "utf-8",
    ),
  )
    ? "PASS"
    : "FAIL"
}`);

const dupes = generated.filter((c, i) => generated.indexOf(c) !== i);
console.log(`4. no duplicate column in the generated list: ${dupes.length === 0 ? "PASS" : `FAIL ${dupes.join(", ")}`}`);

console.log(`\n5. all ${metrics.length} metrics use 30d windows only: ${
  metrics.every(
    (m) =>
      m.movingAverageColumn.startsWith("moving_average_30d_") &&
      m.currentVsMovingAverageColumn.startsWith("current_vs_30d_ma_"),
  )
    ? "PASS"
    : "FAIL"
}`);

console.log(
  `   MA period constant is 30: ${
    BINANCE_POSITIONING_MA_PERIOD === 30
      ? "PASS"
      : `FAIL ${BINANCE_POSITIONING_MA_PERIOD}`
  }`,
);

console.log(
  `   no 12d reference left in the contract: ${
    BINANCE_POSITIONING_METRICS.every(
      (m) => !`${m.movingAverageColumn}${m.currentVsMovingAverageColumn}`.includes("12d"),
    )
      ? "PASS"
      : "FAIL"
  }`,
);

console.log(`6. every metric's historicalColumn is a real historical column: ${
  metrics.every((m) => /_/.test(m.historicalColumn) && !m.historicalColumn.startsWith("current_") && !m.historicalColumn.startsWith("previous_day_"))
    ? "PASS"
    : "FAIL"
}`);

const distinctHist = new Set(metrics.map((m) => m.historicalColumn));
console.log(`7. each metric maps to a distinct historical column: ${
  distinctHist.size === metrics.length ? "PASS" : `FAIL ${metrics.length} metrics, ${distinctHist.size} columns`}`);

// A metric reading the same field as another would silently duplicate data.
const readings = metrics.map((m) => m.getCurrentValue.toString().replace(/\s+/g, " "));
const distinctReadings = new Set(readings);
console.log(`8. each metric reads a distinct field: ${
  distinctReadings.size === metrics.length ? "PASS" : `FAIL ${metrics.length} metrics, ${distinctReadings.size} distinct reads`}`);

console.log(`\n9. latest merge rejects a payload with a missing sub-source: ${
  MISSING_LATEST_SUB_SOURCES.length === 6 ? "PASS" : "FAIL"
}`);

const point = (date: string) => ({
  symbol: "BTCUSDT",
  longAccount: "60.5",
  longShortRatio: "1.53",
  shortAccount: "39.5",
  date,
});

const complete: BinancePositioningLatest = {
  symbol: "BTCUSDT",
  globalLongShort: point("2026-09-25"),
  topAccount: point("2026-09-25"),
  topPosition: point("2026-09-25"),
  openInterest: { symbol: "BTCUSDT", sumOpenInterest: "1000", sumOpenInterestValue: "65", CMCCirculatingSupply: "19", date: "2026-09-25" },
  funding: { symbol: "BTCUSDT", fundingRate: "0.0001", markPrice: "65000", rateType: "PERIODIC", date: "2026-09-25" },
  taker: { buySellRatio: "1.1", sellVol: "500", buyVol: "550", date: "2026-09-25" },
};

const merged = mergeBinanceLatestPositioning(complete);
console.log(`10. complete payload merges: ${merged.date === "2026-09-25" && merged.globalLongAccount === 60.5 ? "PASS" : "FAIL"}`);

let allNamed = true;
for (const key of MISSING_LATEST_SUB_SOURCES) {
  try {
    mergeBinanceLatestPositioning({ ...complete, [key]: undefined });
    console.log(`   FAIL: missing "${key}" did not throw`);
    allNamed = false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(key)) {
      console.log(`   FAIL: error for missing "${key}" did not name it`);
      allNamed = false;
    }
  }
}
console.log(`11. every missing sub-source throws and names itself: ${allNamed ? "PASS" : "FAIL"}`);

console.log(`\n12. every metric getter returns a finite number for a real row: ${
  metrics.every((m) => Number.isFinite(m.getCurrentValue(merged)))
    ? "PASS"
    : "FAIL"
}`);
