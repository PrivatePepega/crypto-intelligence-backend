import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GDELT_MODES, isArticleMode, type GdeltMode } from "./gdeltClient.js";

/**
 * GDELT probe 04 - raw response sweep across every endpoint we set up.
 *
 * Walks all seven documented DOC modes, one request each, **8 seconds between
 * requests**, and records exactly what came back: status, headers and the
 * verbatim response body.
 *
 * ## Why raw fetch rather than the client
 *
 * `requestDoc` parses JSON and throws on anything else, so an HTTP 429 body or
 * an HTML error page would be replaced by a `GdeltApiError` message. That is the
 * right behaviour for production and the wrong thing for this probe - the point
 * here is to see the bytes the server actually sent, including the plain-text
 * error bodies GDELT is known to return.
 *
 * ## Delay
 *
 * 8 seconds is GDELT's stated minimum (one request every 5 seconds) plus
 * margin. It is honoured before *every* request, including the first, so the
 * sweep does not resume the instant probing stopped.
 *
 * Run:
 * ```
 * npx tsx "utils/AI/gdelt tesing area/api/probe04-raw-sweep.ts"
 * ```
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const RAW_DIR = join(HERE, "..", "raw output");

const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

/** Delay between requests, milliseconds. */
const GAP_MS = 8_000;

const TIMEOUT_MS = 90_000;

/** Characters of body shown in the console; the file always gets everything. */
const CONSOLE_BODY_CHARS = 1_500;

const QUERY = "bitcoin";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Per-mode outcome, for the closing summary. */
const results: Array<{
  mode: GdeltMode;
  status: number | null;
  ms: number;
  contentType: string | null;
  bytes: number;
  note: string;
}> = [];

/**
 * Captures one mode.
 *
 * Never throws: a failed request is recorded and the sweep continues, because a
 * single throttled mode must not hide the state of the other six.
 */
const ping = async (mode: GdeltMode): Promise<void> => {
  const url = new URL(BASE);

  url.searchParams.set("query", QUERY);
  url.searchParams.set("mode", mode);
  url.searchParams.set("format", "json");

  // Article-only parameters are withheld from timeline modes, matching the
  // client's rule. Sending them to a timeline is a documented no-op that looks
  // like a filter applied.
  if (isArticleMode(mode)) {
    url.searchParams.set("maxrecords", "5");
  }

  process.stdout.write(`\n${"#".repeat(74)}\n# ${mode}\n${"#".repeat(74)}\n`);
  process.stdout.write(`GET ${url.toString()}\n`);

  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", Connection: "close" },
      signal: controller.signal,
    });

    const body = await response.text();

    const elapsed = Date.now() - startedAt;

    const contentType = response.headers.get("content-type");

    process.stdout.write(`\nHTTP ${response.status} ${response.statusText}  (${elapsed}ms)\n`);
    process.stdout.write(`content-type: ${contentType ?? "(none)"}\n`);
    process.stdout.write(`bytes: ${body.length}\n`);

    // Show the interesting response headers, not all of them.
    for (const header of ["server", "retry-after", "x-ratelimit-limit", "date"]) {
      const value = response.headers.get(header);

      if (value !== null) {
        process.stdout.write(`${header}: ${value}\n`);
      }
    }

    // Verbatim body, exactly as received.
    const shown =
      body.length > CONSOLE_BODY_CHARS
        ? `${body.slice(0, CONSOLE_BODY_CHARS)}\n\n... [truncated, ${
            body.length - CONSOLE_BODY_CHARS
          } more characters in the saved file]`
        : body;

    process.stdout.write(`\n----- RAW BODY -----\n${shown}\n----- END BODY -----\n`);

    // Save the body untouched. Re-serialising parsed JSON would hide whitespace
    // and key order, which are part of what is being inspected here.
    mkdirSync(RAW_DIR, { recursive: true });

    const bodyFile = join(RAW_DIR, `raw-${mode}.txt`);

    writeFileSync(
      bodyFile,
      [
        `# GDELT DOC 2.0 raw response`,
        `# mode      : ${mode}`,
        `# query     : ${QUERY}`,
        `# url       : ${url.toString()}`,
        `# fetched   : ${new Date().toISOString()}`,
        `# status    : ${response.status} ${response.statusText}`,
        `# elapsed   : ${elapsed}ms`,
        `# content-type: ${contentType ?? "(none)"}`,
        `# bytes     : ${body.length}`,
        `#`,
        `# ---- BEGIN VERBATIM BODY ----`,
        body,
        `# ---- END VERBATIM BODY ----`,
        "",
      ].join("\n"),
      "utf8",
    );

    process.stdout.write(`\nsaved: ${bodyFile}\n`);

    let note = "ok";

    if (response.status === 429) {
      note = "RATE LIMITED";
    } else {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;

        if (Object.keys(parsed).length === 0) {
          note = "200 with {} - empty result";
        } else {
          const keys = Object.keys(parsed).join(", ");

          note = `keys: ${keys}`;

          const timeline = parsed.timeline as unknown[] | undefined;

          if (Array.isArray(timeline)) {
            note += ` | ${timeline.length} timeline series`;
          }

          const articles = parsed.articles as unknown[] | undefined;

          if (Array.isArray(articles)) {
            note += ` | ${articles.length} articles`;
          }
        }
      } catch {
        note = "200 but NOT JSON";
      }
    }

    process.stdout.write(`\n>> ${note}\n`);

    results.push({
      mode,
      status: response.status,
      ms: elapsed,
      contentType,
      bytes: body.length,
      note,
    });
  } catch (error) {
    const elapsed = Date.now() - startedAt;

    const message = error instanceof Error ? error.message : String(error);

    process.stdout.write(`\nREQUEST FAILED after ${elapsed}ms: ${message}\n`);

    results.push({
      mode,
      status: null,
      ms: elapsed,
      contentType: null,
      bytes: 0,
      note: message.includes("abort") ? "TIMED OUT" : message,
    });
  } finally {
    clearTimeout(timer);
  }
};

const run = async (): Promise<void> => {
  process.stdout.write(
    `\n${"=".repeat(74)}\n` +
      `GDELT DOC 2.0 - RAW RESPONSE SWEEP\n` +
      `all ${GDELT_MODES.length} modes | query="${QUERY}" | ${GAP_MS / 1000}s between requests\n` +
      `raw bodies saved to raw output/raw-<mode>.txt\n` +
      `${"=".repeat(74)}\n`,
  );

  for (const [index, mode] of GDELT_MODES.entries()) {
    process.stdout.write(
      `\n[${index + 1}/${GDELT_MODES.length}] waiting ${GAP_MS / 1000}s before ${mode}...\n`,
    );

    await sleep(GAP_MS);

    await ping(mode);
  }

  process.stdout.write(`\n${"=".repeat(74)}\nSUMMARY\n${"=".repeat(74)}\n`);

  process.stdout.write(
    `  ${"mode".padEnd(24)}${"status".padEnd(9)}${"ms".padEnd(7)}${"bytes".padEnd(8)}note\n`,
  );

  process.stdout.write(`  ${"-".repeat(90)}\n`);

  for (const result of results) {
    process.stdout.write(
      `  ${result.mode.padEnd(24)}` +
        `${String(result.status ?? "ERR").padEnd(9)}` +
        `${String(result.ms).padEnd(7)}` +
        `${String(result.bytes).padEnd(8)}` +
        `${result.note}\n`,
    );
  }

  const rateLimited = results.filter((r) => r.status === 429).length;

  const empty = results.filter((r) => r.note.startsWith("200 with {}")).length;

  const good = results.filter((r) => r.status === 200 && r.note.startsWith("keys:")).length;

  process.stdout.write(
    `\n  ${good} returned data | ${empty} returned {} | ${rateLimited} rate limited\n`,
  );
  process.stdout.write(`\n  raw bodies: ${join(RAW_DIR, "raw-<mode>.txt")}\n`);
  process.stdout.write(`\n${"=".repeat(74)}\n`);
};

await run();
