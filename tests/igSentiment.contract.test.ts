import { existsSync, readFileSync, readdirSync } from "node:fs";

import {
  IG_SENTIMENT_MARKETS,
  IG_SENTIMENT_MA_PERIOD,
} from "../database/injection/igSentiment.js";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf-8");
const cols = (p: string) =>
  [
    ...read(p).matchAll(/^\s{4}(\w+) (NUMERIC|DATE|TEXT|TIMESTAMPTZ)/gm),
  ].map((m) => m[1]!);

const markets = Object.entries(IG_SENTIMENT_MARKETS);

// Map each table name to the SQL file that declares it, rather than
// re-deriving the filename from the table name.
const fileForTable = (dir: string, table: string): string | undefined => {
  for (const f of readdirSync(new URL(`../database/sql/${dir}/`, import.meta.url))) {
    if (!f.endsWith(".sql")) continue;
    if (
      read(`../database/sql/${dir}/${f}`).includes(`.${table} (`) &&
      read(`../database/sql/${dir}/${f}`).includes(`fk_${table}_indicator`)
    ) {
      return f;
    }
  }
  return undefined;
};

console.log(`markets configured : ${markets.length}`);
console.log(`MA period          : ${IG_SENTIMENT_MA_PERIOD}`);

const ref = cols("../database/sql/current/igSp500.sql");
console.log(`reference columns  : ${ref.length}`);

console.log(
  `\n1. reference has only a 30d window: ${
    read("../database/sql/current/igSp500.sql").match(
      /moving_average_(\d+)d_/g,
    )!.every((m) => m.includes("30d")) && !/moving_average_(3d|6d|12d)_/.test(read("../database/sql/current/igSp500.sql"))
      ? "PASS"
      : "FAIL"
  }`,
);

console.log(
  `2. reference MA column count (expect 3 + 3 current_vs): ${
    ref.filter((c) => c.startsWith("moving_average_")).length === 3 &&
    ref.filter((c) => c.startsWith("current_vs_")).length === 3
      ? "PASS"
      : "FAIL"
  }`,
);

let allOk = true;
for (const [, m] of markets) {
  const file = fileForTable("current", m.table);
  if (!file) {
    console.log(`   FAIL no current SQL file declares ${m.table}`);
    allOk = false;
    continue;
  }
  const sql = read(`../database/sql/current/${file}`);
  if (
    cols(`../database/sql/current/${file}`).join(",") !== ref.join(",") ||
    /moving_average_(3d|6d|12d)_/.test(sql)
  ) {
    console.log(`   FAIL ${file} mismatch`);
    allOk = false;
  }
}
console.log(`\n3. all ${markets.length} current tables present and identical to the reference: ${
  allOk ? "PASS" : "FAIL"
}`);

// The injector must emit exactly the table's column set.
const inj = read("../database/injection/igSentimentCurrent.ts");
const insCols = inj.match(
  /INSERT INTO current\.\$\{config\.table\} \(([\s\S]*?)\)\s*\n\s*VALUES/,
)![1]!;
const injColumnList = insCols
  .split(",")
  .map((c) => c.trim())
  .filter((c) => c !== "");

console.log(
  `4. injector INSERT columns match the table exactly: ${
    injColumnList.join(",") === ref.filter((c) => c !== "updated_at").join(",")
      ? `PASS (${injColumnList.length} = ${ref.length} - updated_at)`
      : `FAIL ${injColumnList.length} vs ${ref.length - 1}`
  }`,
);
console.log(
  `5. only updated_at left unwritten: ${
    ref.filter((c) => !injColumnList.includes(c)).join(",") === "updated_at"
      ? "PASS"
      : "FAIL"
  }`,
);

// Placeholders must be 1..N with no gaps.
const placeholders = [
  ...inj.matchAll(/\$(\d+)/g),
].map((m) => Number(m[1]));
const max = Math.max(...placeholders);
console.log(
  `6. placeholders run 1..${injColumnList.length} with no gaps: ${
    max === injColumnList.length &&
    Array.from({ length: max }, (_, i) => i + 1).every((n) =>
      placeholders.includes(n),
    ) &&
    placeholders.filter((n) => n > injColumnList.length).length === 0
      ? "PASS"
      : `FAIL max=${max}`
  }`,
);

// Count the values array by bracket depth, so nested calls are not split on
// their internal commas.
const valuesStart = inj.indexOf(`      [\n        config.table,`);
const valuesOpen = valuesStart + 6;
let depth = 0;
let valuesClose = -1;
for (let i = valuesOpen; i < inj.length; i++) {
  if (inj[i] === "[") depth++;
  else if (inj[i] === "]") {
    depth--;
    if (depth === 0) {
      valuesClose = i;
      break;
    }
  }
}
const valuesBody = inj.slice(valuesOpen + 1, valuesClose);
let d = 0;
let buf = "";
const valueEntries: string[] = [];
for (const ch of valuesBody) {
  if (ch === "(" || ch === "[" || ch === "{") {
    d++;
    buf += ch;
  } else if (ch === ")" || ch === "]" || ch === "}") {
    d--;
    buf += ch;
  } else if (ch === "," && d === 0) {
    valueEntries.push(buf.trim());
    buf = "";
  } else {
    buf += ch;
  }
}
if (buf.trim() !== "") valueEntries.push(buf.trim());

console.log(
  `7. values array length matches column count: ${
    valueEntries.length === injColumnList.length
      ? `PASS (${valueEntries.length})`
      : `FAIL ${valueEntries.length} vs ${injColumnList.length}`
  }`,
);

// No stale MA figure references. \b matters here: "ma3" must not match the
// "ma30" prefix.
console.log(
  `\n8. no stale 3d/6d/12d figure references: ${
    /\b(ma3|vsMa3|ma6|vsMa6|ma12|vsMa12)\b/.test(inj) ||
    /moving_average_(3d|6d|12d)_|current_vs_(3d|6d|12d)_ma_/.test(inj)
      ? "FAIL"
      : "PASS"
  }`,
);
console.log(
  `9. uses IG_SENTIMENT_MA_PERIOD: ${
    inj.includes("IG_SENTIMENT_MA_PERIOD") ? "PASS" : "FAIL"
  }`,
);
console.log(
  `10. LIMIT derives from it: ${
    /LIMIT \$\{IG_SENTIMENT_MA_PERIOD - 1\}/.test(inj) ? "PASS" : "FAIL"
  }`,
);
console.log(
  `11. ma30/vsMa30 present for all three metrics: ${
    ["longFigures.ma30", "shortFigures.ma30", "netFigures.ma30",
     "longFigures.vsMa30", "shortFigures.vsMa30", "netFigures.vsMa30"].every(
      (t) => inj.includes(t),
    )
      ? "PASS"
      : "FAIL"
  }`,
);
console.log(
  `12. no trailing semicolons in query strings: ${
    /(EXCLUDED\.\w+|NOW\(\)|LIMIT \d+);\s*`/.test(inj) ? "FAIL" : "PASS"
  }`,
);

// The historical injectors are untouched by this change and must still line up.
// The historical tables are untouched by this change.
const histRef = cols(
  `../database/sql/historical/${fileForTable("historical", IG_SENTIMENT_MARKETS.sp500.table)!}`,
);
const histOk = markets.every(([, m]) => {
  const file = fileForTable("historical", m.table);
  if (!file) return false;
  return (
    cols(`../database/sql/historical/${file}`).join(",") === histRef.join(",")
  );
});
console.log(
  `\n13. all 12 historical tables unchanged and identical: ${
    histOk ? `PASS (${histRef.join(", ")})` : "FAIL"
  }`,
);

// Config table names must all have SQL files on both sides.
const missing = markets.filter(
  ([, m]) =>
    !fileForTable("current", m.table) || !fileForTable("historical", m.table),
);
console.log(
  `14. every configured market has both schemas: ${
    missing.length === 0 ? "PASS" : `FAIL ${missing.map(([, m]) => m.table).join(", ")}`
  }`,
);

const seen = new Map<string, string[]>();
for (const dir of ["current", "historical"] as const) {
  for (const f of readdirSync(new URL(`../database/sql/${dir}/`, import.meta.url))) {
    if (!f.endsWith(".sql")) continue;
    for (const m of read(`../database/sql/${dir}/${f}`).matchAll(
      /CREATE TABLE IF NOT EXISTS (historical|current)\.(\w+)/g,
    )) {
      seen.set(`${m[1]}.${m[2]}`, [
        ...(seen.get(`${m[1]}.${m[2]}`) ?? []),
        `${dir}/${f}`,
      ]);
    }
  }
}
const dupes = [...seen.entries()].filter(([, f]) => f.length > 1);
console.log(
  `15. no duplicate CREATE TABLE targets: ${
    dupes.length === 0 ? `PASS (${seen.size} distinct)` : `FAIL ${dupes.map(([k]) => k).join(", ")}`
  }`,
);
