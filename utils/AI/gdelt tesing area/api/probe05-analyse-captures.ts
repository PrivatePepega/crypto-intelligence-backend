import { readFileSync, writeFileSync } from "node:fs";

/**
 * Analyses the captured raw bodies.
 *
 * Reads the verbatim bodies saved by `probe04-raw-sweep.ts` and reports what the
 * two successful timeline responses actually contain - series naming, date
 * coverage and value semantics. Free: no network, no rate-limit budget.
 *
 * Run:
 * ```
 * npx tsx "utils/AI/gdelt tesing area/api/probe05-analyse-captures.ts"
 * ```
 */

const DIR = "utils/AI/gdelt tesing area/raw output/";

const BEGIN_MARKER = "---- BEGIN VERBATIM BODY ----";

const END_MARKER = "---- END VERBATIM BODY ----";

/**
 * Extracts the verbatim body from a saved capture file.
 *
 * The trailing `#` of the closing `# ---- END ... ----` comment line survives a
 * naive split, leaving the body one character long and breaking `JSON.parse`.
 * It has to be stripped explicitly.
 */
const loadBody = (mode: string): string => {
  const raw = readFileSync(`${DIR}raw-${mode}.txt`, "utf8");

  const between = raw.split(BEGIN_MARKER)[1]?.split(END_MARKER)[0] ?? "";

  return between
    .replace(/^\r?\n/, "")
    .replace(/\r?\n#\s*$/, "")
    .trim();
};

type Point = { date: string; value: number };

type Series = { series: string; data: Point[] };

type TimelineResponse = {
  query_details: { title: string; date_resolution: string };
  timeline: Series[];
};

/**
 * Parses GDELT's compact timestamp, e.g. `20260913T000000Z`.
 *
 * Must not be handed to `new Date()` directly: `Date.parse` rejects
 * `20260913Z`, yields `Invalid Date`, and every comparison against `NaN` is
 * false - which silently reports a gap-filled series as contiguous.
 */
const parseGdeltStamp = (stamp: string): number => {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);

  if (match === null) {
    return Number.NaN;
  }

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
};

const lines: string[] = [];

const say = (text = ""): void => {
  lines.push(text);
};

const vol = JSON.parse(loadBody("timelinevol")) as TimelineResponse;

const volSeries = vol.timeline[0];

say("=== timelinevol ===");
say(`  query_details  : ${JSON.stringify(vol.query_details)}`);
say(`  series count   : ${vol.timeline.length}`);
say(`  series name    : ${volSeries?.series}`);
say(`  data points    : ${volSeries?.data.length}`);

const volDates = (volSeries?.data ?? []).map((point) => point.date);

say(`  first date     : ${volDates[0]}`);
say(`  last date      : ${volDates[volDates.length - 1]}`);

const values = (volSeries?.data ?? []).map((point) => point.value);

say(
  `  value range    : ${Math.min(...values)} - ${Math.max(...values)}` +
    `   (share of all coverage, NOT an article count)`,
);

// The important structural detail: days with no coverage are OMITTED, not
// zero-filled. A normalizer that assumes one point per day will misalign.
say("");
say("  --- are the dates contiguous? ---");

const gaps: string[] = [];

let unparsed = 0;

for (let index = 1; index < volDates.length; index += 1) {
  const previous = parseGdeltStamp(volDates[index - 1] ?? "");

  const current = parseGdeltStamp(volDates[index] ?? "");

  if (Number.isNaN(previous) || Number.isNaN(current)) {
    unparsed += 1;

    continue;
  }

  const days = Math.round((current - previous) / 86_400_000);

  if (days > 1) {
    gaps.push(`${volDates[index - 1]} -> ${volDates[index]} (+${days - 1} day(s) absent)`);
  }
}

if (unparsed > 0) {
  say(`    WARNING: ${unparsed} date(s) could not be parsed.`);
}

if (gaps.length === 0) {
  say("    yes, every consecutive day is present");
} else {
  say(`    NO - ${gaps.length} gap(s) where whole days are absent:`);

  for (const gap of gaps) {
    say(`      ${gap}`);
  }

  say("");
  say("    => missing days are omitted, not zero-filled.");
  say("       A normalizer must NOT assume one point per day, or every date");
  say("       after a gap will be off by the number of skipped days.");
}

const zeroPoints = (volSeries?.data ?? []).filter((p) => p.value === 0);

say(`  explicit zero-valued points: ${zeroPoints.length}`);

if (zeroPoints.length > 0) {
  say(`    dates: ${zeroPoints.map((p) => p.date).join(", ")}`);

  say("    => a real zero (coverage existed but was 0%) is distinct from an absent day.");
}

say("");
say("=== timelinelang ===");

const lang = JSON.parse(loadBody("timelinelang")) as TimelineResponse;

say(`  series count   : ${lang.timeline.length}`);
say(`  payload bytes  : ${loadBody("timelinelang").length}`);
say("");
say("  series names (one per language, '<Language> Volume Intensity'):");

for (const series of lang.timeline) {
  const total = series.data.reduce((sum, point) => sum + point.value, 0);

  say(
    `    ${series.series.replace(" Volume Intensity", "").padEnd(20)}` +
      `points=${String(series.data.length).padEnd(5)}` +
      `sum=${total.toFixed(3)}`,
  );
}

say("");
say("  => Series are keyed by language name, NOT by a language code.");
say("     'Bulgarian Volume Intensity' means the series for Bulgarian-language");
say("     coverage. There is no machine-readable language field, so a consumer");
say("     must parse the name - and must not assume a fixed set of 25.");

say("");
say("=== payload cost warning ===");
say(`  timelinelang with NO time filter : ${loadBody("timelinelang").length} bytes`);
say(`  timelinevol with NO time filter  : ${loadBody("timelinevol").length} bytes`);
say("");
say("  timelinelang is 25 series x ~84 days in a single response.");
say("  Every agent-facing call must set an explicit window, or it pays for");
say("  three months of data per language and blows the token budget.");

// Written inside the testing area, never to the repository root.
writeFileSync(`${DIR}capture-analysis.txt`, lines.join("\n"), "utf8");

console.log(lines.join("\n"));
console.log("\n(saved to raw output/capture-analysis.txt)");
