import { readFileSync } from "node:fs";

import { BINANCE_POSITIONING_MARKETS } from "../database/injection/binancePositioning.js";

const markets = Object.entries(BINANCE_POSITIONING_MARKETS);

console.log(`configured markets: ${markets.length}`);

const fetcher = readFileSync(
  new URL("../collectors/binance/binanceFetcher.ts", import.meta.url),
  "utf-8",
);

const symbolBlock = fetcher.match(/const SYMBOLS = \[([\s\S]*?)\] as const;/)?.[1];
if (!symbolBlock) {
  console.log("FAIL: could not locate the SYMBOLS array in binanceFetcher.ts");
  process.exit(1);
}
const fetcherSymbols = [...symbolBlock.matchAll(/"(\w+USDT)"/g)].map((m) => m[1]!);

console.log(`\n1. every configured market's symbol is requested by the fetcher: ${
  markets.every(([, m]) => fetcherSymbols.includes(m.symbol)) ? "PASS" : "FAIL"
}`);
console.log(`   configured: ${markets.map(([, m]) => m.symbol).join(", ")}`);
console.log(`   fetcher:    ${fetcherSymbols.join(", ")}`);

console.log(`\n2. every fetcher symbol has a configured market: ${
  fetcherSymbols.every((s) => markets.some(([, m]) => m.symbol === s)) ? "PASS" : "FAIL"
}`);

console.log(`\n3. no duplicate symbols or seriesIds: ${
  new Set(markets.map(([, m]) => m.symbol)).size === markets.length &&
  new Set(markets.map(([, m]) => m.seriesId)).size === markets.length &&
  new Set(markets.map(([, m]) => m.table)).size === markets.length
    ? "PASS"
    : "FAIL"
}`);

// The FK target must exist in the indicator metadata or every insert fails.
const indicatorDir = new URL("../database/injection/indicators/", import.meta.url);
const { readdirSync } = await import("node:fs");
const metadata = readdirSync(indicatorDir)
  .filter((f) => f.startsWith("binance") && f.endsWith(".ts"))
  .map((f) => readFileSync(new URL(f, indicatorDir), "utf-8"))
  .join("\n");

const missingFk = markets.filter(([, m]) => !metadata.includes(`seriesId: "${m.seriesId}"`));
console.log(`\n4. every seriesId resolves to an indicator metadata entry: ${
  missingFk.length === 0 ? "PASS" : `FAIL ${missingFk.map(([, m]) => m.seriesId).join(", ")}`
}`);

console.log(`\n5. each market has both SQL files, column-identical to BTCUSDT: `);
const refHist = readFileSync(
  new URL("../database/sql/historical/binanceBtcusdt.sql", import.meta.url),
  "utf-8",
);
const refCurr = readFileSync(
  new URL("../database/sql/current/binanceBtcusdt.sql", import.meta.url),
  "utf-8",
);
const cols = (sql: string) =>
  [...sql.matchAll(/^\s{4}(\w+) (NUMERIC|DATE|TEXT|TIMESTAMPTZ)/gm)].map((m) => m[1]!);
const refH = cols(refHist).join(",");
const refC = cols(refCurr).join(",");

let allMatch = true;
for (const [, m] of markets) {
  const stem = `binance${m.symbol.replace("USDT", "usdt").replace(/^./, (c) => c.toUpperCase())}`;
  // BTCUSDT -> Btcusdt, SOLUSDT -> Solusdt etc.
  const fileStem = `binance${m.symbol.slice(0, -4).charAt(0).toUpperCase()}${m.symbol.slice(1, -4).toLowerCase()}usdt`;

  for (const [dir, ref, label] of [
    ["historical", refH, "hist"],
    ["current", refC, "curr"],
  ] as const) {
    const path = new URL(`../database/sql/${dir}/${fileStem}.sql`, import.meta.url);
    let sql: string;
    try {
      sql = readFileSync(path, "utf-8");
    } catch {
      console.log(`   FAIL ${fileStem}.sql (${label}) missing`);
      allMatch = false;
      continue;
    }
    const same = cols(sql).join(",") === ref;
    const tableOk = sql.includes(`.${m.table} (`);
    const fkOk = sql.includes(`fk_${m.table}_indicator`);
    if (!same || !tableOk || !fkOk) {
      console.log(
        `   FAIL ${fileStem}.sql (${label}) cols=${same} table=${tableOk} fk=${fkOk}`,
      );
      allMatch = false;
    }
  }
}
console.log(`   ${allMatch ? "PASS - all 8 markets x 2 schemas identical to the BTCUSDT reference" : "FAIL"}`);

console.log(`\n6. no table name is defined twice across both schemas: `);
const seen = new Map<string, string[]>();
for (const dir of ["current", "historical"] as const) {
  for (const file of readdirSync(new URL(`../database/sql/${dir}/`, import.meta.url))) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(new URL(`../database/sql/${dir}/${file}`, import.meta.url), "utf-8");
    for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (historical|current)\.(\w+)/g)) {
      const key = `${m[1]}.${m[2]}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(`${dir}/${file}`);
    }
  }
}
const dupes = [...seen.entries()].filter(([, files]) => files.length > 1);
console.log(
  `   ${dupes.length === 0
    ? `PASS - ${seen.size} distinct tables, none defined twice`
    : `FAIL ${dupes.map(([k, f]) => `${k} in ${f.join(" + ")}`).join("; ")}`}`,
);
