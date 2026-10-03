/**
 * Capture the raw FMP `fmp-articles` response for inspection.
 *
 * This is the raw-capture step, deliberately separate from normalisation. It
 * records what FMP actually sends so the normalizer can be written against the
 * real shape rather than against the documented one - which matters here,
 * because `fmp-articles` is the one endpoint that does **not** populate
 * `structuredContent` and instead returns a bare JSON array in the text block.
 *
 * Run: npx tsx mcp/fmp/captureRaw.ts
 *
 * Out:
 *   mcp/fmp/raw/fmp-articles.<variant>.result.json   full MCP envelope
 *   mcp/fmp/raw/fmp-articles.<variant>.records.json  extracted records only
 *   mcp/fmp/raw/fmp-articles.shape.json              field-shape report
 *
 * `fmp-articles` is the only one of the six wrapped endpoints available on a
 * free plan, so it is the only one that returns data here. That makes it the
 * only shape we can currently verify.
 */

import { mkdir, writeFile } from "node:fs/promises";
import "dotenv/config";

import {
  callFmpTool,
  closeFmpClient,
  readPayloadRecords,
} from "./client.js";

const RAW_DIR = "mcp/fmp/raw";

/**
 * Capture variants.
 *
 * `limit` is varied to see whether FMP honours it and whether a larger page
 * changes the field set. A date window is added because `from_date`/`to_date`
 * are documented on the `news` tool but their effect on this endpoint is not
 * - worth capturing before trusting them.
 */
const VARIANTS: { label: string; args: Record<string, unknown> }[] = [
  { label: "limit-3", args: { endpoint: "fmp-articles", limit: 3 } },
  { label: "limit-20", args: { endpoint: "fmp-articles", limit: 20 } },
  {
    label: "limit-20-recent",
    args: {
      endpoint: "fmp-articles",
      limit: 20,
      from_date: "2026-09-01",
      to_date: "2026-10-03",
    },
  },
];

/** Collects the union of keys across records. */
const unionKeys = (records: Record<string, unknown>[]): string[] => {
  const keys = new Set<string>();

  for (const record of records) {
    for (const key of Object.keys(record)) {
      keys.add(key);
    }
  }

  return [...keys];
};

/** Infers a coarse type name for a sample value. */
const inferType = (value: unknown): string => {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";

  return typeof value;
};

/** Whether a string looks like it carries HTML markup. */
const looksLikeHtml = (value: string): boolean => /<[a-z/][^>]*>/i.test(value);

/**
 * Reports how a field behaves, which is what the normalizer actually needs to
 * decide: whether a value is always present, how long it runs, and whether it
 * needs stripping.
 */
const describeField = (
  records: Record<string, unknown>[],
  key: string,
): Record<string, unknown> => {
  const values = records.map((record) => record[key]);

  const present = values.filter((value) => value !== undefined && value !== null);

  const sample = present[0];

  const report: Record<string, unknown> = {
    field: key,
    type: inferType(sample),
    present: present.length,
    of: records.length,
  };

  if (typeof sample === "string") {
    const lengths = present.map((value) => (value as string).length);

    const withHtml = present.filter((value) => looksLikeHtml(value as string));

    report.minLength = Math.min(...lengths);
    report.maxLength = Math.max(...lengths);
    report.avgLength = Math.round(
      lengths.reduce((total, length) => total + length, 0) / lengths.length,
    );
    report.containsHtml = withHtml.length;
    report.excerpt = (sample as string).slice(0, 200);
  } else if (typeof sample === "number") {
    const numbers = present as number[];

    report.min = Math.min(...numbers);
    report.max = Math.max(...numbers);
    report.excerpt = sample;
  } else {
    report.excerpt = sample;
  }

  // A short list of distinct values is more useful than one sample when a
  // field looks like an enum.
  const distinct = [...new Set(present.map((value) => JSON.stringify(value)))];

  if (distinct.length > 1 && distinct.length <= 8) {
    report.distinctValues = distinct.map((value) => JSON.parse(value) as unknown);
  } else if (distinct.length > 1) {
    report.distinctCount = distinct.length;
  }

  return report;
};

const main = async (): Promise<void> => {
  await mkdir(RAW_DIR, { recursive: true });

  console.log("");
  console.log("=".repeat(70));
  console.log("FMP fmp-articles RAW CAPTURE");
  console.log("=".repeat(70));

  const allRecords: Record<string, unknown>[] = [];

  for (const variant of VARIANTS) {
    console.log(`\n--- ${variant.label}`);
    console.log(`    args: ${JSON.stringify(variant.args)}`);

    const startedAt = Date.now();

    const result = await callFmpTool("news", variant.args);

    const elapsed = Date.now() - startedAt;

    if (result.isError) {
      const message = (result.content ?? [])
        .map((item) => ("text" in item ? (item.text ?? "") : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      console.log(`    ERROR: ${message.slice(0, 200)}`);

      continue;
    }

    const records = readPayloadRecords(result);

    console.log(`    ${elapsed}ms, ${records.length} record(s)`);

    // Record which envelope shape produced these records. This is the detail
    // that matters most: the documented shape is `structuredContent.data`, and
    // for this endpoint it is not what arrives.
    const structured = result.structuredContent as unknown;

    const envelope = {
      variant: variant.label,
      args: variant.args,
      elapsedMs: elapsed,
      capturedAt: new Date().toISOString(),
      hasStructuredContent: structured != null,
      structuredContentKeys:
        structured && typeof structured === "object"
          ? Object.keys(structured as object)
          : null,
      contentBlockCount: (result.content ?? []).length,
      contentBlockTypes: (result.content ?? []).map(
        (item) => item.type,
      ),
      recordCount: records.length,
      fieldNames: unionKeys(records),
    };

    console.log(
      `    envelope: structuredContent=${
        structured != null ? "present" : "ABSENT"
      }  content=${(result.content ?? []).length} block(s) ${
        (result.content ?? []).length > 0
          ? `(${((result.content ?? [])[0] as { type?: string }).type})`
          : ""
      }`,
    );

    await writeFile(
      `${RAW_DIR}/fmp-articles.${variant.label}.result.json`,
      JSON.stringify({ envelope, result }, null, 2),
      "utf8",
    );

    await writeFile(
      `${RAW_DIR}/fmp-articles.${variant.label}.records.json`,
      JSON.stringify(records, null, 2),
      "utf8",
    );

    allRecords.push(...records);
  }

  // --------------------------------------------------
  // Field shape across everything captured
  // --------------------------------------------------

  if (allRecords.length === 0) {
    console.log("");
    console.log("No records captured. Nothing to profile.");

    return;
  }

  console.log("");
  console.log("=".repeat(70));
  console.log(`FIELD SHAPE (${allRecords.length} records)`);
  console.log("=".repeat(70));

  const shape = unionKeys(allRecords).map((key) =>
    describeField(allRecords, key),
  );

  for (const field of shape) {
    console.log(
      `  ${String(field.field).padEnd(10)} ${String(field.type).padEnd(7)} ` +
        `${field.present}/${field.of}`,
    );

    if (field.containsHtml !== undefined) {
      console.log(
        `             length ${field.minLength}-${field.maxLength} ` +
          `(avg ${field.avgLength}), html in ${field.containsHtml}/${field.of}`,
      );
    }

    if (field.distinctValues) {
      console.log(`             values: ${JSON.stringify(field.distinctValues)}`);
    }

    if (field.excerpt !== undefined) {
      const text =
        typeof field.excerpt === "string"
          ? field.excerpt
          : JSON.stringify(field.excerpt);

      console.log(`             e.g. ${text.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }

  await writeFile(
    `${RAW_DIR}/fmp-articles.shape.json`,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        endpoint: "fmp-articles",
        totalRecords: allRecords.length,
        fieldCount: shape.length,
        fields: shape,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("");
  console.log(`Wrote ${VARIANTS.length * 2 + 1} file(s) to ${RAW_DIR}`);
};

main()
  .catch((error: unknown) => {
    console.error("");
    console.error("CAPTURE FAILED");
    console.error("----------------------------------------------");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await closeFmpClient();
  });