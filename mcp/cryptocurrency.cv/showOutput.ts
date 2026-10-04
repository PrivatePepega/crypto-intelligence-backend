import { mkdir, readFile, writeFile } from "node:fs/promises";

import { normalizeBreaking } from "./breaking.normalizer.js";
import { normalizeDefiNews } from "./defi.normalizer.js";
import { normalizeNewsExtract } from "./newsExtract.normalizer.js";
import { normalizeSearch } from "./search.normalizer.js";
import { normalizeTagArticles } from "./tagsArticles.normalizer.js";
import { normalizeTrending } from "./trending.normalizer.js";

/**
 * Run every normalizer against the captured responses and show the result.
 *
 * Run: npx tsx mcp/cryptocurrency.cv/showOutput.ts
 *
 * Reads `raw/*.json` rather than calling the API, so it is offline and free -
 * important while the account is rate-limited.
 *
 * Only normalizers whose capture exists are run, so this stays in step with
 * whatever `raw/` currently holds rather than reporting a wall of empties for
 * endpoints that were removed.
 *
 * Captures that recorded a failure are reported as failures, not as empty
 * results, so a rate-limited capture cannot be mistaken for "no news".
 */

const RAW_DIR = "mcp/cryptocurrency.cv/raw";
const OUT_DIR = "mcp/cryptocurrency.cv/normalized";

interface Case {
  slug: string;
  endpoint: string;
  normalize: (raw: unknown) => { count: number; items: unknown[] };
}

const CASES: Case[] = [
  { slug: "defi", endpoint: "GET /api/defi", normalize: normalizeDefiNews },
  {
    slug: "breaking",
    endpoint: "GET /api/breaking",
    normalize: normalizeBreaking,
  },
  { slug: "search", endpoint: "GET /api/search", normalize: normalizeSearch },
  {
    slug: "tags-bitcoin",
    endpoint: "GET /api/tags/bitcoin",
    normalize: normalizeTagArticles,
  },
  {
    slug: "news-extract",
    endpoint: "POST /api/news/extract",
    normalize: normalizeNewsExtract,
  },
  { slug: "trending", endpoint: "GET /api/trending", normalize: normalizeTrending },
];

/** Reads a capture, reporting whether it holds data or recorded a failure. */
const readCapture = async (
  slug: string,
): Promise<
  { state: "ok"; raw: unknown } | { state: "failed"; error: string } | { state: "missing" }
> => {
  let text: string;

  try {
    text = await readFile(`${RAW_DIR}/${slug}.json`, "utf8");
  } catch {
    return { state: "missing" };
  }

  const parsed = JSON.parse(text) as { ok?: boolean; error?: string };

  if (parsed.ok === false) {
    const message =
      typeof parsed.error === "string"
        ? parsed.error.replace(/\s+/g, " ").slice(0, 110)
        : "unknown error";

    return { state: "failed", error: message };
  }

  return { state: "ok", raw: parsed };
};

const main = async (): Promise<void> => {
  const output: Record<string, unknown> = {};

  const tally = { ok: 0, failed: 0, missing: 0 };

  await mkdir(OUT_DIR, { recursive: true });

  for (const testCase of CASES) {
    const capture = await readCapture(testCase.slug);

    if (capture.state === "missing") {
      tally.missing += 1;

      output[testCase.endpoint] = { capture: "missing" };

      await writeFile(
        `${OUT_DIR}/${testCase.slug}.json`,
        JSON.stringify({ capture: "missing" }, null, 2),
        "utf8",
      );

      continue;
    }

    if (capture.state === "failed") {
      tally.failed += 1;

      output[testCase.endpoint] = { capture: "failed", error: capture.error };

      await writeFile(
        `${OUT_DIR}/${testCase.slug}.json`,
        JSON.stringify({ capture: "failed", error: capture.error }, null, 2),
        "utf8",
      );

      continue;
    }

    const normalized = testCase.normalize(capture.raw);

    if (normalized.count > 0) {
      tally.ok += 1;
    } else {
      tally.failed += 1;
    }

    output[testCase.endpoint] = normalized;

    await writeFile(
      `${OUT_DIR}/${testCase.slug}.json`,
      JSON.stringify(normalized, null, 2),
      "utf8",
    );
  }

  console.log("");
  console.log(JSON.stringify(output, null, 2));

  console.log("");
  console.log("=".repeat(70));
  console.log(`  with data : ${tally.ok}`);
  console.log(`  no data   : ${tally.failed}`);
  console.log(`  missing   : ${tally.missing}`);
  console.log(`  written   : ${OUT_DIR}/`);
  console.log("=".repeat(70));
};

void main().catch((error: unknown) => {
  console.error(error);

  process.exitCode = 1;
});