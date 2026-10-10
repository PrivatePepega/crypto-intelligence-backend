/**
 * GDELT probe 01 - verify every documented DOC mode.
 *
 * Runs each mode once with an identical query so the responses are comparable,
 * saves the raw body to `raw output/`, and prints the response *shape* rather
 * than the body. A mode that fails is recorded and skipped - the sweep must
 * survive one bad mode.
 *
 * Establishes the schemas the normalizers get written from. Nothing here is
 * inferred from documentation.
 */

import {
  GDELT_MODES,
  GdeltApiError,
  isArticleMode,
  requestDoc,
  type GdeltMode,
} from "./gdeltClient.js";

import { banner, captureRaw, describeShape, subhead } from "./capture.js";

/** Identical across modes so responses are directly comparable. */
const QUERY = "bitcoin";

/** Bounds each response; the default window is the full rolling ~3 months. */
const TIMESPAN = "24h";

const runMode = async (mode: GdeltMode): Promise<void> => {
  subhead(`mode=${mode}  timespan=${TIMESPAN}  query="${QUERY}"`);

  try {
    const result = await requestDoc({
      query: QUERY,
      mode,
      timespan: TIMESPAN,
      ...(isArticleMode(mode) ? { maxrecords: 5 } : {}),
    });

    const file = captureRaw(`01-${mode}`, {
      request: { mode, query: QUERY, timespan: TIMESPAN },
      response: result.data,
      url: result.url,
      elapsedMs: result.elapsedMs,
    });

    process.stdout.write(`    OK  ${result.elapsedMs}ms  attempts=${result.attempts}\n`);
    process.stdout.write(`    shape: ${describeShape(result.data)}\n`);
    process.stdout.write(`    saved: ${file}\n`);

    // Show one real record so field semantics are visible, not just field names.
    const payload = result.data as Record<string, unknown> | null;

    if (payload !== null && typeof payload === "object") {
      if (Array.isArray(payload.articles) && payload.articles.length > 0) {
        process.stdout.write(`    first article:\n      ${JSON.stringify(payload.articles[0])}\n`);
      }

      if (Array.isArray(payload.timeline) && payload.timeline.length > 0) {
        for (const series of payload.timeline as Record<string, unknown>[]) {
          const data = Array.isArray(series.data) ? series.data : [];

          process.stdout.write(
            `    series "${String(series.series)}": ${data.length} points` +
              (data.length > 0
                ? `\n      first: ${JSON.stringify(data[0])}\n` +
                  `      last:  ${JSON.stringify(data[data.length - 1])}`
                : ""),
          );

          process.stdout.write("\n");
        }
      }
    }
  } catch (error) {
    const status = error instanceof GdeltApiError ? error.status : -1;

    const body = error instanceof GdeltApiError ? error.body : "";

    process.stdout.write(`    FAILED  status=${status}\n`);

    process.stdout.write(`    error: ${error instanceof Error ? error.message : String(error)}\n`);

    captureRaw(`01-${mode}-FAILED`, {
      request: { mode, query: QUERY, timespan: TIMESPAN },
      status,
      message: error instanceof Error ? error.message : String(error),
      body,
    });
  }
};

const run = async (): Promise<void> => {
  banner("GDELT DOC 2.0 - MODE SWEEP");

  process.stdout.write(
    `\n  ${GDELT_MODES.length} modes, one shared query, results saved to raw output/\n`,
  );

  for (const mode of GDELT_MODES) {
    await runMode(mode);
  }

  banner("SWEEP COMPLETE");
};

await run();
