/**
 * Inspect the one field we care about from `fmp-articles`.
 *
 * Makes the same call as `raw/fmp-articles.limit-3.records.json` but asks for
 * 20 records, and projects each one down to just `title`.
 *
 * Run: npx tsx mcp/fmp/normalizer.test.ts
 *
 * `content` is deliberately dropped. It is the full article as HTML, running
 * 1987-3599 characters per record (55278 characters, roughly 14k tokens across
 * 20 records) and repeating its own summary as a bullet list before the body
 * paragraphs. The headline alone carries the signal for headline-level
 * monitoring.
 *
 * Deliberately minimal otherwise: it selects fields and nothing else. No
 * renaming, no reshaping, so what comes back is exactly what FMP sends.
 */

import { mkdir, writeFile } from "node:fs/promises";

import {
  callFmpTool,
  closeFmpClient,
  readPayloadRecords,
} from "./client.js";

/** The only field kept from each record. */
const KEEP = ["title"] as const;

const OUTPUT_DIR = "mcp/fmp/normalized";

/**
 * Projects a record down to the kept field.
 *
 * A missing field becomes `null` rather than being dropped, so a record is
 * always the same shape and a gap is visible instead of inferred from an absent
 * key.
 */
const pickFields = (
  record: Record<string, unknown>,
): Record<(typeof KEEP)[number], string | null> => ({
  title: typeof record.title === "string" ? record.title : null,
});

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("FMP fmp-articles - title only");
  console.log("=".repeat(70));

  const result = await callFmpTool("news", {
    endpoint: "fmp-articles",
    limit: 20,
  });

  if (result.isError) {
    const message = (result.content ?? [])
      .map((item) => ("text" in item ? (item.text ?? "") : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    throw new Error(message || "FMP call failed with no error message.");
  }

  const records = readPayloadRecords(result);

  const picked = records.map(pickFields);

  console.log(`  ${records.length} record(s), keeping: ${KEEP.join(", ")}`);
  console.log("");
  console.log(JSON.stringify(picked, null, 2));

  await mkdir(OUTPUT_DIR, { recursive: true });

  await writeFile(
    `${OUTPUT_DIR}/fmp-articles.titles.json`,
    JSON.stringify(picked, null, 2),
    "utf8",
  );

  // A quick size read, to confirm the agent-facing payload is now small
  // enough to sit in a tool result without truncation.
  const lengths = picked.map((item) => item.title?.length ?? 0);

  console.log("");
  console.log("=".repeat(70));
  console.log("title length");
  console.log("=".repeat(70));
  console.log(
    `  min ${Math.min(...lengths)}  max ${Math.max(...lengths)}  ` +
      `avg ${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)}`,
  );
  console.log(
    `  total across ${picked.length} records: ` +
      `${lengths.reduce((a, b) => a + b, 0)} chars`,
  );

  await closeFmpClient();
};

main().catch((error: unknown) => {
  console.error("");
  console.error("FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});