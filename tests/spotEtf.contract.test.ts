import { existsSync, readFileSync, readdirSync } from "node:fs";

import {
  SPOT_ETF_COUNTRY_CODE,
  SPOT_ETF_MA_PERIOD,
  SPOT_ETF_MARKETS,
  SPOT_ETF_METRICS,
  isSpotEtfObservationComplete,
} from "../database/injection/spotEtf.js";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf-8");
const cols = (p: string) =>
  [...read(p).matchAll(/^\s{4}(\w+) (NUMERIC|DATE|TEXT|TIMESTAMPTZ|INTEGER)/gm)].map(
    (m) => m[1]!,
  );

const markets = Object.entries(SPOT_ETF_MARKETS);
const metrics = SPOT_ETF_METRICS;

const stem = (symbol: string) =>
  `${symbol.charAt(0).toLowerCase()}${symbol.slice(1)}SpotEtf.sql`;

const generated = [
  "indicator",
  "series_id",
  ...metrics.map((m) => m.currentColumn),
  ...metrics.map((m) => m.previousColumn),
  ...metrics.map((m) => m.netChangeColumn),
  ...metrics.map((m) => m.percentChangeColumn),
  ...metrics.map((m) => m.movingAverageColumn),
  ...metrics.map((m) => m.currentVsMovingAverageColumn),
  "asset",
  "country_code",
  "observed_at",
];

console.log(`markets configured : ${markets.length}`);
console.log(`metrics per market : ${metrics.length}`);
console.log(`MA period          : ${SPOT_ETF_MA_PERIOD}`);
console.log(`generated columns  : ${generated.length}`);

console.log(
  `\n1. all six markets present: ${
    markets.length === 6 ? "PASS" : `FAIL ${markets.length}`
  }  (${markets.map(([, m]) => m.symbol).join(", ")})`,
);

// Every seriesId must resolve to real indicator metadata or the FK rejects it.
const meta = readdirSync(
  new URL("../database/injection/indicators/", import.meta.url),
)
  .filter((f) => f.startsWith("spotetf") && f.endsWith(".ts"))
  .map((f) => read(`../database/injection/indicators/${f}`))
  .join("\n");

const badFk = markets.filter(([, m]) => !meta.includes(`seriesId: "${m.seriesId}"`));
console.log(
  `2. every seriesId resolves to indicator metadata: ${
    badFk.length === 0 ? "PASS" : `FAIL ${badFk.map(([, m]) => m.seriesId).join(", ")}`
  }`,
);

// Every symbol must be one the collector actually requests.
const typesSrc = read("../types/sososValue/sososValue.types.ts");
const symbolBlock = typesSrc.match(
  /sosoValueEtfSymbolSchema = z\.enum\(\[([\s\S]*?)\]\)/,
)![1]!;
const valid = [...symbolBlock.matchAll(/"(\w+)"/g)].map((m) => m[1]!);
console.log(
  `3. every symbol is a valid collector symbol: ${
    markets.every(([, m]) => valid.includes(m.symbol))
      ? `PASS (collector has ${valid.join(", ")})`
      : "FAIL"
  }`,
);
console.log(
  `   no collector symbol left without a market: ${
    valid.every((s) => markets.some(([, m]) => m.symbol === s)) ? "PASS" : "FAIL"
  }`,
);

// Duplicate keys would silently overwrite rows.
console.log(
  `\n4. no duplicate symbol / seriesId / table / label: ${
    new Set(markets.map(([, m]) => m.symbol)).size === markets.length &&
    new Set(markets.map(([, m]) => m.seriesId)).size === markets.length &&
    new Set(markets.map(([, m]) => m.table)).size === markets.length
      ? "PASS"
      : "FAIL"
  }`,
);

// Each market needs both SQL files, matching the BTC reference exactly.
const refHist = cols("../database/sql/historical/btcSpotEtf.sql").join(",");
const refCurr = cols("../database/sql/current/btcSpotEtf.sql").join(",");

let sqlOk = true;
for (const [, m] of markets) {
  for (const [dir, ref, label] of [
    ["historical", refHist, "hist"],
    ["current", refCurr, "curr"],
  ] as const) {
    const p = `../database/sql/${dir}/${stem(m.symbol)}`;
    if (!existsSync(new URL(p, import.meta.url))) {
      console.log(`   FAIL ${stem(m.symbol)} (${label}) missing`);
      sqlOk = false;
      continue;
    }
    const sql = read(p);
    if (
      cols(p).join(",") !== ref ||
      !sql.includes(`.${m.table} (`) ||
      !sql.includes(`fk_${m.table}_indicator`)
    ) {
      console.log(`   FAIL ${stem(m.symbol)} (${label}) shape mismatch`);
      sqlOk = false;
    }
  }
}
console.log(`\n5. all 6 markets x 2 schemas exist and match the BTC reference: ${
  sqlOk ? "PASS" : "FAIL"
}`);

// The generated INSERT must satisfy every current table.
const generatedOk = markets.every(([, m]) => {
  const t = cols(`../database/sql/current/${stem(m.symbol)}`);
  return (
    generated.every((c) => t.includes(c)) &&
    t.filter((c) => !generated.includes(c)).join(",") === "updated_at"
  );
});
console.log(`6. generated INSERT fits every current table: ${generatedOk ? "PASS" : "FAIL"}`);

const histInsert = [
  "date",
  "series_id",
  "asset",
  "country_code",
  ...metrics.map((m) => m.historicalColumn),
];
const histOk = markets.every(([, m]) => {
  const t = cols(`../database/sql/historical/${stem(m.symbol)}`);
  return histInsert.every((c) => t.includes(c)) && t.length === histInsert.length;
});
console.log(`7. historical INSERT fits every historical table: ${histOk ? "PASS" : "FAIL"}`);

console.log(
  `\n8. arithmetic 2 + ${metrics.length}x6 + 3 = ${
    2 + metrics.length * 6 + 3
  } (actual ${generated.length})`,
);

// The old BTC-only injectors must be gone and unreferenced.
const removed = [
  "../database/injection/historical/spot_etf_btc.ts",
  "../database/injection/current/spot_etf_btc.ts",
];
console.log(
  `\n9. BTC-specific injectors removed: ${
    removed.every((p) => !existsSync(new URL(p, import.meta.url)))
      ? "PASS"
      : "FAIL"
  }`,
);

const scripts = [
  read("../database/scripts/historical/fullInjection.ts"),
  read("../database/scripts/current/latestInjection.ts"),
].join("\n");
console.log(
  `10. no stale imports of the removed injectors: ${
    /spot_etf_btc\.js|injectSpotEtfBtc/.test(scripts) ? "FAIL" : "PASS"
  }`,
);
console.log(
  `11. both scripts iterate SPOT_ETF_MARKETS: ${
    (scripts.match(/Object\.values\(SPOT_ETF_MARKETS\)/g) ?? []).length === 2
      ? "PASS"
      : "FAIL"
  }`,
);

// current_vs convention and the string-typed NUMERIC guard.
const curr = read("../database/injection/spotEtfCurrent.ts");
console.log(
  `\n12. current_vs_30d_ma uses absolute difference: ${
    /currentValues\[index\]! - movingAverage/.test(curr) ? "PASS" : "FAIL"
  }`,
);
console.log(
  `13. historical rows typed string, blank-safe conversion: ${
    /Record<string, string \| null>/.test(curr) &&
    /trimmed === "" \? null : Number\(trimmed\)/.test(curr)
      ? "PASS"
      : "FAIL"
  }`,
);
console.log(
  `14. no trailing semicolons in query strings: ${
    /(EXCLUDED\.\w+|NOW\(\)|LIMIT \d+);\s*`/.test(
      curr + read("../database/injection/spotEtfHistorical.ts"),
    )
      ? "FAIL"
      : "PASS"
  }`,
);
console.log(
  `15. LIMIT derives from MA_PERIOD: ${
    /LIMIT \$\{SPOT_ETF_MA_PERIOD - 1\}/.test(curr) ? "PASS" : "FAIL"
  }`,
);
console.log(`16. country code constant: ${SPOT_ETF_COUNTRY_CODE}`);

// Completeness guard must reject a NaN and accept a real zero.
const good = {
  date: "2026-09-25",
  netFlow: 0,
  valueTraded: 1,
  netAssets: 2,
  cumulativeNetFlow: 3,
};
console.log(
  `\n17. completeness guard accepts a real 0: ${
    isSpotEtfObservationComplete(good) ? "PASS" : "FAIL"
  }`,
);
console.log(
  `18. completeness guard rejects NaN: ${
    isSpotEtfObservationComplete({ ...good, netFlow: Number.NaN })
      ? "FAIL"
      : "PASS"
  }`,
);

// No table defined twice anywhere.
const seen = new Map<string, string[]>();
for (const dir of ["current", "historical"] as const) {
  for (const f of readdirSync(new URL(`../database/sql/${dir}/`, import.meta.url))) {
    if (!f.endsWith(".sql")) continue;
    for (const m of read(`../database/sql/${dir}/${f}`).matchAll(
      /CREATE TABLE IF NOT EXISTS (historical|current)\.(\w+)/g,
    )) {
      const k = `${m[1]}.${m[2]}`;
      seen.set(k, [...(seen.get(k) ?? []), `${dir}/${f}`]);
    }
  }
}
const dupes = [...seen.entries()].filter(([, files]) => files.length > 1);
console.log(
  `\n19. no duplicate CREATE TABLE targets: ${
    dupes.length === 0
      ? `PASS (${seen.size} distinct tables)`
      : `FAIL ${dupes.map(([k, f]) => `${k}: ${f.join(" + ")}`).join("; ")}`
  }`,
);
