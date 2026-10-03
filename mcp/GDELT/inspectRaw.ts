/**
 * Reads the captured raw files and prints the field inventory that matters for
 * writing the normalizers.
 *
 * Focuses on the two summarize tools, which are the ones with no normalizer
 * yet. Their bucket shape changes with `group_by`, which is the thing to settle
 * before writing a normalizer for them.
 *
 *   npx tsx mcp/GDELT/inspectRaw.ts
 */
import { readFileSync, readdirSync } from "node:fs";

type Json = Record<string, unknown>;

const DIR = "mcp/GDELT/raw";

const asJson = (v: unknown): Json | undefined =>
  v && typeof v === "object" ? (v as Json) : undefined;

/** Reads `_gdelt.payload` out of a captured file. */
const loadPayload = (file: string): Json | undefined => {
  const parsed = JSON.parse(readFileSync(`${DIR}/${file}`, "utf8")) as Json;
  const response = asJson(parsed.response);

  return asJson(asJson(response?._gdelt)?.payload);
};

/** Prints a field table, marking nested structures and nulls. */
const fieldTable = (label: string, record: Json | undefined): void => {
  if (!record) {
    console.log(`  ${label}: (no record)`);
    return;
  }

  const keys = Object.keys(record);

  console.log(`  ${label}  (${keys.length} fields)`);
  for (const key of keys) {
    const value = record[key];
    let shown: string;

    if (value === null) {
      shown = "null";
    } else if (Array.isArray(value)) {
      const first = asJson(value[0]);
      shown = first
        ? `array[${value.length}] of {${Object.keys(first).length} keys}`
        : `array[${value.length}]`;
    } else if (typeof value === "object") {
      shown = `{${Object.keys(value as Json).length} keys}`;
    } else {
      const text = String(value);
      shown = text.length > 46 ? `${text.slice(0, 46)}…` : text;
    }

    console.log(`    ${key.padEnd(28)} ${shown}`);
  }
};

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

console.log("=".repeat(74));
console.log("CAPTURED FILES");
console.log("=".repeat(74));
for (const f of files) {
  console.log(`  ${f}`);
}

// --- the two summarize tools -----------------------------------------
for (const file of files.filter((f) => f.startsWith("summarize_"))) {
  console.log("");
  console.log("=".repeat(74));
  console.log(file.replace(".json", ""));
  console.log("=".repeat(74));

  const payload = loadPayload(file);

  console.log(`  envelope keys : [${Object.keys(payload ?? {}).join(", ")}]`);

  const data = payload?.data;
  if (Array.isArray(data)) {
    console.log(`  buckets       : ${data.length}`);
    fieldTable("bucket[0]", asJson(data[0]));
  } else {
    console.log("  buckets       : (data is not an array)");
  }

  // Fields present across every bucket, so you can see which are stable.
  if (Array.isArray(data)) {
    const all = data.map((b) => asJson(b) ?? {});
    const shared = Object.keys(all[0] ?? {}).filter((k) =>
      all.every((b) => k in b),
    );
    console.log(`  fields in all buckets (${shared.length}): ${shared.join(", ")}`);
  }
}

// --- the by-id tools, for reference ----------------------------------
for (const file of files.filter(
  (f) => f.startsWith("get_") && !f.includes("by-"),
)) {
  console.log("");
  console.log("=".repeat(74));
  console.log(file.replace(".json", ""));
  console.log("=".repeat(74));

  const payload = loadPayload(file);
  const data = payload?.data;

  console.log(
    `  data shape    : ${Array.isArray(data) ? `array[${data.length}]` : "single object"}`,
  );
  fieldTable("record", Array.isArray(data) ? asJson(data[0]) : asJson(data));
}

// --- search tools, summary only --------------------------------------
for (const file of files.filter((f) => f.startsWith("search_"))) {
  console.log("");
  console.log("=".repeat(74));
  console.log(file.replace(".json", ""));
  console.log("=".repeat(74));

  const payload = loadPayload(file);
  const data = payload?.data;
  const first = Array.isArray(data) ? asJson(data[0]) : undefined;

  console.log(`  records       : ${Array.isArray(data) ? data.length : 0}`);
  console.log(`  field count   : ${first ? Object.keys(first).length : 0}`);
  if (first) {
    console.log(`  fields        : ${Object.keys(first).join(", ")}`);
  }
}