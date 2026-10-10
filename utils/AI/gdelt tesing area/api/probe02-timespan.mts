/**
 * GDELT probe 02 - isolate two anomalies from probe 01.
 *
 * ## Anomaly A: silent empty result
 *
 * `timespan=24h` returned HTTP 200 with a body of literally `{}`. That is the
 * dangerous kind of failure: a normalizer would read it as "no coverage exists"
 * rather than "your parameter was rejected". This probe finds the timespan
 * grammar the endpoint actually accepts.
 *
 * ## Anomaly B: "fetch failed"
 *
 * Three modes failed at the socket layer with `fetch failed`, immediately after
 * 429s. GDELT advertises `Keep-Alive: max=20`, so the hypothesis is a poisoned
 * pooled connection rather than a bad request. This probe sends
 * `Connection: close` on every call.
 *
 * Uses raw `fetch` deliberately - the client under test would otherwise change
 * the very variables being isolated.
 */

const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

/** Wide enough to clear the 429s seen so far. */
const GAP_MS = 15_000;

const TIMEOUT_MS = 60_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Case = {
  label: string;
  params: Record<string, string>;
};

/** Explicit 48h window ending an hour ago, to compare against the timespans. */
const NOW = Date.now();

const fmt = (epochMs: number): string => {
  const d = new Date(epochMs);

  const p = (n: number, w = 2): string => String(n).padStart(w, "0");

  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
};

const cases: Case[] = [
  {
    label: "control - no timespan (default full window)",
    params: { mode: "artlist", maxrecords: "3" },
  },
  {
    label: "timespan=24h  (returned {} in probe 01)",
    params: { mode: "artlist", maxrecords: "3", timespan: "24h" },
  },
  {
    label: "timespan=1d",
    params: { mode: "artlist", maxrecords: "3", timespan: "1d" },
  },
  {
    label: "timespan=7d",
    params: { mode: "artlist", maxrecords: "3", timespan: "7d" },
  },
  {
    label: "timespan=1440min",
    params: { mode: "artlist", maxrecords: "3", timespan: "1440min" },
  },
  {
    label: `explicit start/end (48h ending 1h ago)`,
    params: {
      mode: "artlist",
      maxrecords: "3",
      startdatetime: fmt(NOW - 49 * 3600_000),
      enddatetime: fmt(NOW - 1 * 3600_000),
    },
  },
];

const run = async (): Promise<void> => {
  process.stdout.write(
    "\n========================================================================\n" +
      "GDELT DOC 2.0 - TIMESPAN GRAMMAR + CONNECTION REUSE\n" +
      "========================================================================\n",
  );

  process.stdout.write(
    `\n  Connection: close on every request.\n` + `  Gap between requests: ${GAP_MS / 1000}s\n`,
  );

  for (const testCase of cases) {
    const url = new URL(BASE);

    url.searchParams.set("query", "bitcoin");
    url.searchParams.set("format", "json");

    for (const [key, value] of Object.entries(testCase.params)) {
      url.searchParams.set(key, value);
    }

    process.stdout.write(`\n--- ${testCase.label}\n`);

    const controller = new AbortController();

    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Connection: "close",
        },
        signal: controller.signal,
      });

      const text = await response.text();

      const elapsed = Date.now() - startedAt;

      let parsed: unknown = null;

      let parsedOk = false;

      try {
        parsed = JSON.parse(text);

        parsedOk = true;
      } catch {
        parsedOk = false;
      }

      const articleCount = parsedOk
        ? ((parsed as Record<string, unknown>).articles as unknown[] | undefined)?.length
        : undefined;

      const timelineCount = parsedOk
        ? ((parsed as Record<string, unknown>).timeline as unknown[] | undefined)?.length
        : undefined;

      const topKeys = parsedOk ? Object.keys(parsed as Record<string, unknown>).join(",") : "-";

      process.stdout.write(`    HTTP ${response.status}  ${elapsed}ms  bytes=${text.length}\n`);

      process.stdout.write(`    keys: [${topKeys}]`);

      if (articleCount !== undefined) {
        process.stdout.write(`  articles=${articleCount}`);
      }

      if (timelineCount !== undefined) {
        process.stdout.write(`  timelineSeries=${timelineCount}`);
      }

      process.stdout.write("\n");

      // The empty-object case is the one that matters most, so call it out.
      if (parsedOk && Object.keys(parsed as object).length === 0) {
        process.stdout.write(`    ** EMPTY OBJECT: parameters accepted but no data returned **\n`);
      }

      process.stdout.write(`    body head: ${text.slice(0, 200).replace(/\n/g, "\\n")}\n`);
    } catch (error) {
      process.stdout.write(
        `    THREW after ${Date.now() - startedAt}ms: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    } finally {
      clearTimeout(timer);
    }

    await sleep(GAP_MS);
  }

  process.stdout.write(
    "\n========================================================================\n" +
      "PROBE 02 COMPLETE\n" +
      "========================================================================\n",
  );
};

await run();
