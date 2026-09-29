import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "database", "injection", "current");

// The 39 injectors touched by the 3d/6d/12d -> 30d/6month/12month migration.
const names = [
  "aluminum","aud_usd","brent","cnn_fear_greed","cnn_market_momentum_sp125",
  "cnn_market_volatility_vix_50","cnn_put_call_options","cnn_safe_haven_demand",
  "cnn_stock_price_breadth","copper","eur_usd","gbp_usd","gold","natural_gas",
  "nzd_usd","silver","usd_cad","usd_chf","usd_jpy","wti",
  "advanced_economy_usd_index","alternative_crypto_fear_greed","broad_usd_index",
  "dow_jones","emerging_market_usd_index","five_year_inflation_expectations",
  "five_year_treasury","high_yield_credit_spread","investment_grade_credit_spread",
  "nasdaq_composite","real_broad_usd_index","real_ten_year_treasury_yield",
  "reverse_repo_usage","russell_2000","sp500","ten_year_breakeven_inflation",
  "ten_year_treasury_yield","three_month_treasury","vix",
];

const WINDOWS = ["30d", "6month", "12month"];

/** Count top-level elements of an array-literal body, ignoring nesting and strings. */
function countTopLevel(body: string): number {
  // These arrays use a trailing comma after the final element.
  const trimmed = body.replace(/\s*$/, "").replace(/,\s*$/, "");

  let depth = 0;
  let entries = 0;
  let sawContent = false;
  let inStr: string | null = null;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;

    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === inStr) inStr = null;
      sawContent = true;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; sawContent = true; continue; }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; sawContent = true; continue; }
    if (ch === ")" || ch === "]" || ch === "}") { depth--; continue; }
    if (ch === "," && depth === 0) { entries++; continue; }
    if (!/\s/.test(ch)) sawContent = true;
  }

  return sawContent ? entries + 1 : 0;
}

/** Grab the balanced bracket group starting at `open`, respecting strings. */
function balanced(src: string, open: number): string {
  const openCh = src[open]!;
  const closeCh = openCh === "(" ? ")" : openCh === "[" ? "]" : "}";
  let depth = 0;
  let inStr: string | null = null;

  for (let i = open; i < src.length; i++) {
    const ch = src[i]!;
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error("unbalanced bracket");
}

let failures = 0;
const report: string[] = [];

for (const name of names) {
  const src = readFileSync(path.join(dir, `${name}.ts`), "utf8");
  const problems: string[] = [];

  // 1. INSERT column list
  const insertAt = src.indexOf("INSERT INTO current.");
  if (insertAt < 0) throw new Error(`${name}: no INSERT`);

  const colListOpen = src.indexOf("(", insertAt);
  const colBody = balanced(src, colListOpen);
  const columns = colBody
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  // 2. VALUES placeholders
  const valuesAt = src.indexOf("VALUES", colListOpen);
  const valBody = balanced(src, src.indexOf("(", valuesAt));
  const placeholders = [...valBody.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  const maxPh = placeholders.length ? Math.max(...placeholders) : 0;
  const uniquePh = new Set(placeholders).size;

  // 3. bound parameter array = the [ ... ] that closes right after ON CONFLICT block
  const updatedAt = src.lastIndexOf("updated_at = NOW()");
  const arrOpen = src.indexOf("[", updatedAt);
  const paramBody = balanced(src, arrOpen);
  const paramCount = countTopLevel(paramBody);

  if (columns.length !== maxPh) problems.push(`cols ${columns.length} != maxPh ${maxPh}`);
  if (uniquePh !== maxPh) problems.push(`placeholder gap/dup (${uniquePh} unique of ${maxPh})`);
  if (paramCount !== maxPh) problems.push(`params ${paramCount} != ${maxPh}`);

  // 4. all three windows present in columns, INSERT list and DO UPDATE
  const updateAt = src.indexOf("ON CONFLICT");
  const updateBody = src.slice(updateAt, arrOpen);
  for (const w of WINDOWS) {
    if (!columns.includes(`moving_average_${w}`)) problems.push(`missing column moving_average_${w}`);
    if (!columns.includes(`current_vs_${w}_ma`)) problems.push(`missing column current_vs_${w}_ma`);
    if (!updateBody.includes(`moving_average_${w} = EXCLUDED.moving_average_${w}`)) {
      problems.push(`missing DO UPDATE moving_average_${w}`);
    }
    if (!updateBody.includes(`current_vs_${w}_ma = EXCLUDED.current_vs_${w}_ma`)) {
      problems.push(`missing DO UPDATE current_vs_${w}_ma`);
    }
  }

  // 5. no stale window anywhere
  if (/\b(3d|6d|12d)\b/.test(src)) problems.push("residual 3d/6d/12d token");

  // 6. the MA query uses calendar intervals and has no LIMIT-based fetch
  for (const iv of ["30 days", "6 months", "12 months"]) {
    if (!src.includes(`INTERVAL '${iv}'`)) problems.push(`missing INTERVAL '${iv}'`);
  }
  if (/\bLIMIT\s+1[12]\b/.test(src)) problems.push("old observation-count LIMIT survived");

  if (problems.length) failures++;
  report.push(
    `${name.padEnd(38)} cols=${String(columns.length).padStart(3)} ph=${String(maxPh).padStart(3)} params=${String(paramCount).padStart(3)}  ${problems.length ? "FAIL: " + problems.join("; ") : "OK"}`,
  );
}

console.log(report.join("\n"));
console.log("");
console.log(
  failures === 0
    ? `ALL ${names.length} INJECTORS OK: columns == placeholders == params, all three windows present`
    : `PROBLEMS IN ${failures} FILES`,
);

// also confirm the 39 SQL tables each declare all six columns
let sqlBad = 0;
const sqlDir = path.join(process.cwd(), "database", "sql", "current");
for (const f of readdirSync(sqlDir).filter((f) => f.endsWith(".sql"))) {
  const s = readFileSync(path.join(sqlDir, f), "utf8");
  if (!/moving_average_(3d|6d|12d)\b/.test(s) && !/current_vs_(3d|6d|12d)_ma\b/.test(s)) continue;
  console.log(`  STALE SQL: ${f}`);
  sqlBad++;
}
console.log(sqlBad === 0 ? "SQL: no stale 3d/6d/12d columns remain" : `SQL: ${sqlBad} stale files`);
