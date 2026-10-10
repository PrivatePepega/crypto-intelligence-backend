/**
 * GDELT probe - one question, one request.
 *
 * The rate limit is the binding constraint on this integration: a 90-second
 * cooldown with zero requests still returned HTTP 429. Probing is therefore done
 * one question at a time with a long wait, and every response is captured as
 * evidence so a normalizer can be written from a real body rather than from
 * documentation.
 *
 * ## Usage
 *
 * ```
 * npx tsx probe-one.ts --mode=artlist --query=bitcoin --maxrecords=5
 * npx tsx probe-one.ts --mode=timelinevol --query=bitcoin --timespan=24h
 * npx tsx probe-one.ts --mode=artlist --query=bitcoin --start=20261008120000 --end=20261010120000
 * ```
 *
 * ## Options
 *
 * ```
 * --mode      <artlist|timelinevol|timelinevolraw|timelinevolinfo|timelinetone|timelinelang|timelinesourcecountry>
 * --query     <query expression, including operators>
 * --timespan  <relative window; mutually exclusive with --start/--end>
 * --start     <YYYYMMDDHHMMSS>
 * --end       <YYYYMMDDHHMMSS>
 * --maxrecords <1-250>
 * --sort      <HybridRel|datedesc>
 * --cooldown  <ms to wait before the first request, default 180000>
 * --retries   <429 retries, default 2>
 * --tag       <filename fragment identifying the question>
 * ```
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const RAW_DIR = join(HERE, "..", "raw output");

const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

const MODES = [
  "artlist",
  "timelinevol",
  "timelinevolraw",
  "timelinevolinfo",
  "timelinetone",
  "timelinelang",
  "timelinesourcecountry",
] as const;

/** Minimal `--key=value` parsing; unknown keys are ignored rather than fatal. */
const args = new Map<string, string>();

for (const raw of process.argv.slice(2)) {
  const match = /^--([^=]+)=?(.*)$/.exec(raw);

  if (match?.[1] !== undefined) {
    args.set(match[1], match[2] ?? "");
  }
}

const get = (key: string): string | undefined => args.get(key);

const num = (key: string): number | undefined => {
  const raw = get(key);

  if (raw === undefined || raw === "") {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
};

const mode = get("mode") ?? "artlist";

if (!(MODES as readonly string[]).includes(mode)) {
  throw new Error(`--mode must be one of: ${MODES.join(", ")}`);
}

const query = get("query") ?? "bitcoin";

const cooldown = num("cooldown") ?? 180_000;

const maxRetries = num("retries") ?? 2;

const tag = get("tag") ?? mode;

const url = new URL(BASE);

url.searchParams.set("query", query);
url.searchParams.set("mode", mode);
url.searchParams.set("format", "json");

const timespan = get("timespan");

const start = get("start");

const end = get("end");

if (timespan !== undefined) {
  url.searchParams.set("timespan", timespan);
}

if (start !== undefined) {
  url.searchParams.set("startdatetime", start);
}

if (end !== undefined) {
  url.searchParams.set("enddatetime", end);
}

const maxrecords = num("maxrecords");

if (maxrecords !== undefined) {
  url.searchParams.set("maxrecords", String(maxrecords));
}

const sort = get("sort");

if (sort !== undefined) {
  url.searchParams.set("sort", sort);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Captures the outcome - success or failure - so both leave evidence. */
const capture = (record: unknown): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const file = join(RAW_DIR, `one-${tag}-${stamp}.json`);

  try {
    writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
  } catch {
    return "(capture failed)";
  }

  return file;
};

/** Renders a value as a compact type name. */
const typeName = (value: unknown): string => {
  if (value === null) return "null";

  if (Array.isArray(value)) return "array";

  return typeof value;
};

/** Describes the response shape without dumping the body. */
const describeShape = (value: unknown, depth = 0): string => {
  if (depth > 4) return "...";

  if (Array.isArray(value)) {
    if (value.length === 0) return "array(0)[]";

    return `array(${value.length})<${describeShape(value[0], depth + 1)}>`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) return "{}";

    return `{${entries.map(([k, v]) => `${k}: ${describeShape(v, depth + 1)}`).join(", ")}}`;
  }

  if (typeof value === "string") {
    return `string(${JSON.stringify(value.length > 24 ? `${value.slice(0, 24)}...` : value)})`;
  }

  return typeName(value);
};

process.stdout.write(`\nQUESTION [${tag}]\n`);
process.stdout.write(`  ${url.toString()}\n`);
process.stdout.write(`  cooldown ${cooldown / 1000}s, maxRetries ${maxRetries}\n`);

process.stdout.write(`\n  waiting...\n`);

await sleep(cooldown);

let attempt = 0;
let settled = false;

while (!settled) {
  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), 90_000);

  const startedAt = Date.now();

  process.stdout.write(
    `\n  request ${attempt + 1} at +${Math.round((Date.now() - startedAt + cooldown) / 1000)}s\n`,
  );

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", Connection: "close" },
      signal: controller.signal,
    });

    const text = await response.text();

    const elapsed = Date.now() - startedAt;

    if (response.status === 429 && attempt < maxRetries) {
      attempt += 1;

      process.stdout.write(
        `    HTTP 429 (${elapsed}ms) - retry ${attempt}/${maxRetries} in 120s\n`,
      );

      clearTimeout(timer);

      await sleep(120_000);

      continue;
    }

    settled = true;

    process.stdout.write(`    HTTP ${response.status}  ${elapsed}ms  bytes=${text.length}\n`);

    let parsed: unknown = null;

    let parsedOk = false;

    try {
      parsed = JSON.parse(text);

      parsedOk = true;
    } catch {
      parsedOk = false;
    }

    if (!parsedOk) {
      process.stdout.write(`    NOT JSON: ${text.slice(0, 300)}\n`);

      capture({ url: url.toString(), status: response.status, body: text });

      break;
    }

    process.stdout.write(`    shape: ${describeShape(parsed)}\n`);

    const record = parsed as Record<string, unknown>;

    const articles = record.articles as Record<string, unknown>[] | undefined;

    if (Array.isArray(articles)) {
      process.stdout.write(`    articles: ${articles.length}\n`);

      const first = articles[0];

      if (first !== undefined) {
        process.stdout.write(`\n    FIELD SCHEMA (article[0]):\n`);

        for (const [key, value] of Object.entries(first)) {
          process.stdout.write(
            `      ${key}: ${typeName(value)} = ${JSON.stringify(value)?.slice(0, 140)}\n`,
          );
        }
      }
    }

    const timeline = record.timeline as Record<string, unknown>[] | undefined;

    if (Array.isArray(timeline)) {
      process.stdout.write(`    timeline series: ${timeline.length}\n`);

      for (const series of timeline) {
        const data = Array.isArray(series.data) ? series.data : [];

        process.stdout.write(`      "${String(series.series)}" -> ${data.length} points`);

        if (data.length > 0) {
          process.stdout.write(
            `\n        first: ${JSON.stringify(data[0])}\n        last:  ${JSON.stringify(data[data.length - 1])}`,
          );
        }

        process.stdout.write("\n");
      }
    }

    if (Object.keys(record).length === 0) {
      process.stdout.write(`    ** EMPTY OBJECT - parameters accepted, no data returned **\n`);
    }

    const file = capture({
      question: tag,
      request: { mode, query, timespan, start, end, maxrecords, sort },
      status: response.status,
      url: url.toString(),
      response: parsed,
    });

    process.stdout.write(`\n    captured: ${file}\n`);
  } catch (error) {
    const elapsed = Date.now() - startedAt;

    if (attempt < maxRetries) {
      attempt += 1;

      process.stdout.write(
        `    THREW (${elapsed}ms): ${error instanceof Error ? error.message : String(error)}\n` +
          `    retry ${attempt}/${maxRetries} in 120s\n`,
      );

      clearTimeout(timer);

      await sleep(120_000);

      continue;
    }

    settled = true;

    process.stdout.write(
      `    THREW (${elapsed}ms): ${error instanceof Error ? error.message : String(error)}\n`,
    );

    capture({ question: tag, status: 0, error: String(error) });
  } finally {
    clearTimeout(timer);
  }
}

process.stdout.write("\nDONE\n");
