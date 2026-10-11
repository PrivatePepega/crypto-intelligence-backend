import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GDELT_DEFAULT_MAX_RECORDS,
  GDELT_MAX_RECORDS,
  describeGdeltResponse,
  searchGdeltArticles,
  type GdeltSearchParams,
} from "./gdeltClient.js";

/**
 * Filter sweep - hits the endpoint once per operator and saves every raw
 * response to `raw/`.
 *
 * ## Why this exists
 *
 * Several of these operators are **unverified**. An operator that silently
 * matches nothing looks exactly like one that works, and GDELT signals "no
 * matches" with HTTP 200 and a literal `{}` rather than with an error. So the
 * only way to tell them apart is to read the response bodies - which is what
 * this collects.
 *
 * ## Pacing
 *
 * 8 seconds between requests. GDELT asks for one every 5 seconds; 8 leaves
 * margin. Observed behaviour from earlier runs: 8 seconds still produced roughly
 * a 20% success rate, and some requests failed at the socket level
 * (`fetch failed`) when GDELT shed connections. A throttled case is saved with
 * its body intact and is worth re-running - it proves nothing either way.
 *
 * ## Raw output
 *
 * Each case writes `raw/<label>.json` holding the request URL, the parameters as
 * sent, the timing, the status and the body **exactly as received**. Nothing is
 * transformed, so a surprising result can be checked against what the provider
 * actually sent.
 *
 * Run when ready:
 * ```
 * npx tsx "utils/AI/gdelt testing area/gdeltFilters.test.ts"
 * ```
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where raw responses are written. */
export const RAW_DIR = join(HERE, "raw");

/** Gap between pings, milliseconds. */
const PING_DELAY_MS = 8_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Formats an epoch as GDELT's `YYYYMMDDHHMMSS` UTC stamp. */
const gdeltStamp = (epochMs: number): string => {
  const d = new Date(epochMs);

  const p = (n: number): string => String(n).padStart(2, "0");

  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
};

/**
 * The explicit window used by the datetime case.
 *
 * Computed at run time rather than hardcoded, so the case is still meaningful
 * whenever this is eventually run. Ends an hour ago to avoid the newest partial
 * bucket, which GDELT reports as a zero.
 */
const WINDOW_START = gdeltStamp(Date.now() - 5 * 86_400_000);

const WINDOW_END = gdeltStamp(Date.now() - 3_600_000);

type Case = {
  /** Filename-safe label; also the summary row name. */
  label: string;

  /** The operator or parameter this case probes. */
  note: string;

  params: GdeltSearchParams;
};

/**
 * Every case, in the order they are pinged.
 *
 * Exported so the list can be inspected without making a single request.
 */
export const CASES: Case[] = [
  {
    label: "01-baseline",
    note: `Plain query on defaults (timespan=${"24h"}, maxrecords=${GDELT_DEFAULT_MAX_RECORDS}, sort=HybridRel)`,
    params: { query: "bitcoin" },
  },

  // ---- 1. Core text search ----
  {
    label: "02-exact-phrase",
    note: 'Exact phrase: "Federal Reserve"',
    params: { query: '"Federal Reserve"' },
  },
  {
    label: "03-boolean-or",
    note: "Boolean OR: (bitcoin OR ethereum)",
    params: { query: "(bitcoin OR ethereum)" },
  },
  {
    label: "04-exclusion",
    note: "Exclusion: bitcoin -mining",
    params: { query: "bitcoin -mining" },
  },
  {
    label: "05-proximity",
    note:
      'Proximity: near10:"tariffs China" - the space is encoded as "+" on the wire, ' +
      "so this also tests whether GDELT reads + as a space inside quotes",
    params: { query: 'near10:"tariffs China"' },
  },
  {
    label: "06-repetition",
    note: 'Repetition: repeat3:"inflation"',
    params: { query: 'repeat3:"inflation"' },
  },

  // ---- 2. Source filters ----
  {
    label: "07-domain",
    note: "Publisher domain and subdomains: domain:reuters.com",
    params: { query: "bitcoin domain:reuters.com" },
  },
  {
    label: "08-domainis",
    note: "Exact publisher domain: domainis:reuters.com",
    params: { query: "bitcoin domainis:reuters.com" },
  },
  {
    label: "09-sourcecountry",
    note: "Publisher country: sourcecountry:unitedstates",
    params: { query: "bitcoin sourcecountry:unitedstates" },
  },
  {
    label: "10-sourcelang",
    note: "Original language: sourcelang:spanish",
    params: { query: "bitcoin sourcelang:spanish" },
  },
  {
    label: "11-sourcelang-negative",
    note: "Negated filter: bitcoin -sourcelang:spanish",
    params: { query: "bitcoin -sourcelang:spanish" },
  },

  // ---- 3. Themes and tone ----
  {
    label: "12-theme",
    note: "GDELT GKG theme: theme:TERROR",
    params: { query: "theme:TERROR" },
  },
  {
    label: "13-tone-negative",
    note: "Negative tone: bitcoin tone<-5  (tone is reporting style, NOT financial sentiment)",
    params: { query: "bitcoin tone<-5" },
  },
  {
    label: "14-toneabs",
    note: "Strong tone either direction: bitcoin toneabs>10",
    params: { query: "bitcoin toneabs>10" },
  },

  // ---- 4. URL parameters ----
  {
    label: "15-timespan-24h",
    note: "timespan=24h stated explicitly (this is also the client default)",
    params: { query: "bitcoin", timespan: "24h" },
  },
  {
    label: "16-timespan-7d",
    note: "timespan=7d",
    params: { query: "bitcoin", timespan: "7d" },
  },
  {
    label: "17-explicit-datetime",
    note: `Explicit window ${WINDOW_START} to ${WINDOW_END} (5 days, ending 1h ago)`,
    params: {
      query: "bitcoin",
      startdatetime: WINDOW_START,
      enddatetime: WINDOW_END,
    },
  },
  {
    label: "18-maxrecords-5",
    note: "maxrecords=5",
    params: { query: "bitcoin", maxrecords: 5 },
  },
  {
    label: "19-maxrecords-ceiling",
    note: `maxrecords=${GDELT_MAX_RECORDS} (documented ceiling)`,
    params: { query: "bitcoin", maxrecords: GDELT_MAX_RECORDS },
  },
  {
    label: "20-sort-datedesc",
    note: "sort=datedesc (most recently seen first)",
    params: { query: "bitcoin", sort: "datedesc", maxrecords: 10 },
  },
];

/** Article count from a parsed body, or `null` when there is no body. */
const countArticles = (bodyJson: unknown): number | null => {
  if (bodyJson === null || typeof bodyJson !== "object") {
    return null;
  }

  const articles = (bodyJson as Record<string, unknown>).articles;

  return Array.isArray(articles) ? articles.length : null;
};

/** Writes one capture. A write failure is reported, never fatal. */
const saveRaw = (label: string, record: unknown): string | null => {
  try {
    mkdirSync(RAW_DIR, { recursive: true });

    const file = join(RAW_DIR, `${label}.json`);

    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    return file;
  } catch {
    return null;
  }
};

type Row = {
  label: string;
  status: number | null;
  articles: number | null;
  empty: boolean;
  elapsedMs: number;
  note: string;
};

/** Runs every case in order. */
export const runSweep = async (): Promise<void> => {
  console.log(
    `\n${"=".repeat(74)}\n` +
      `GDELT artlist - filter sweep\n` +
      `${CASES.length} cases | ${PING_DELAY_MS / 1000}s between pings\n` +
      `raw responses -> ${RAW_DIR}\n` +
      `defaults: maxrecords=${GDELT_DEFAULT_MAX_RECORDS} (ceiling ${GDELT_MAX_RECORDS})\n` +
      `${"=".repeat(74)}\n`,
  );

  const rows: Row[] = [];

  for (const [index, testCase] of CASES.entries()) {
    console.log(
      `\n[${index + 1}/${CASES.length}] ${testCase.label} - waiting ${PING_DELAY_MS / 1000}s...`,
    );

    await sleep(PING_DELAY_MS);

    const startedAt = Date.now();

    try {
      const response = await searchGdeltArticles(testCase.params);

      const articles = countArticles(response.bodyJson);

      const file = saveRaw(testCase.label, {
        note: testCase.note,
        requestUrl: response.requestUrl,
        sent: response.sent,
        requestedAt: response.requestedAt,
        status: response.status,
        statusText: response.statusText,
        elapsedMs: response.elapsedMs,
        contentType: response.contentType,
        body: response.body,
      });

      console.log(`     ${describeGdeltResponse(response)}`);
      console.log(`     ${testCase.note}`);

      if (response.bodyIsEmptyObject) {
        console.log(`     >> {} - matched nothing. A valid response, not an error, and not`);
        console.log(`        evidence that anything did or did not happen.`);
      }

      console.log(`     saved: ${file ?? "(not written)"}`);

      rows.push({
        label: testCase.label,
        status: response.status,
        articles,
        empty: response.bodyIsEmptyObject,
        elapsedMs: Date.now() - startedAt,
        note: describeGdeltResponse(response),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      console.log(`     THREW: ${message}`);

      saveRaw(`${testCase.label}-FAILED`, {
        note: testCase.note,
        params: testCase.params,
        requestedAt: new Date().toISOString(),
        status: 0,
        error: message,
      });

      rows.push({
        label: testCase.label,
        status: null,
        articles: null,
        empty: false,
        elapsedMs: Date.now() - startedAt,
        note: message.slice(0, 80),
      });
    }
  }

  console.log(`\n${"=".repeat(74)}\nSUMMARY\n${"=".repeat(74)}`);
  console.log(
    `  ${"case".padEnd(24)}${"status".padEnd(8)}${"arts".padEnd(6)}${"ms".padEnd(8)}outcome`,
  );
  console.log(`  ${"-".repeat(88)}`);

  for (const row of rows) {
    console.log(
      `  ${row.label.padEnd(24)}${String(row.status ?? "ERR").padEnd(8)}` +
        `${String(row.articles ?? "-").padEnd(6)}${String(row.elapsedMs).padEnd(8)}` +
        `${row.note.slice(0, 44)}`,
    );
  }

  const ok = rows.filter((row) => row.status === 200).length;

  const throttled = rows.filter((row) => row.status === 429).length;

  const empty = rows.filter((row) => row.empty).length;

  const dead = rows.filter((row) => row.status !== 200).length;

  console.log(
    `\n  ${ok} returned 200 | ${empty} matched nothing | ${throttled} rate limited | ${dead} unusable`,
  );

  if (throttled > 0 || dead > ok) {
    console.log(`\n  Throttled and failed cases prove nothing about the operator. Re-run to`);
    console.log(`  confirm them; every one is saved under raw/ with its body preserved.`);
  }

  console.log(`\n  Read raw/<case>.json for the full body of each.`);
  console.log(`${"=".repeat(74)}\n`);
};

// Only sweeps when executed directly, so `CASES` can be imported and inspected
// without triggering a single request.
const isDirectRun =
  process.argv[1] !== undefined &&
  process.argv[0] !== undefined &&
  process.argv[1].replace(/\\/g, "/").endsWith("gdeltFilters.test.ts");

if (isDirectRun) {
  await runSweep();
}
