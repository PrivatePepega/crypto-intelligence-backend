/**
 * GDELT probe 03 - the single decisive question.
 *
 * Every previous `artlist` attempt was rate-limited or carried a time
 * parameter, so it is still unknown whether `{}` means:
 *
 *   (a) the time parameters were silently rejected, or
 *   (b) `artlist` genuinely had no matches in that window.
 *
 * One request settles it: `artlist` with **no** time parameter at all, using
 * the full default rolling window. If that returns articles, `{}` was the
 * window. If it also returns `{}`, the mode itself is behaving differently.
 *
 * Deliberately issues exactly one request after a long cooldown - the rate
 * limit is the binding constraint, not our time budget.
 */

const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

/** Long cooldown: recent probes have been throttled hard. */
const COOLDOWN_MS = 90_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

process.stdout.write(`  cooling down ${COOLDOWN_MS / 1000}s...\n`);

await sleep(COOLDOWN_MS);

const url = new URL(BASE);

url.searchParams.set("query", "bitcoin");
url.searchParams.set("mode", "artlist");
url.searchParams.set("maxrecords", "5");
url.searchParams.set("format", "json");

process.stdout.write(`\n  GET ${url.toString()}\n\n`);

const controller = new AbortController();

const timer = setTimeout(() => controller.abort(), 60_000);

const startedAt = Date.now();

try {
  const response = await fetch(url, {
    headers: { Accept: "application/json", Connection: "close" },
    signal: controller.signal,
  });

  const text = await response.text();

  process.stdout.write(
    `  HTTP ${response.status}  ${Date.now() - startedAt}ms  bytes=${text.length}\n\n`,
  );

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;

    const articles = (parsed.articles as Record<string, unknown>[] | undefined) ?? [];

    process.stdout.write(`  top-level keys: ${Object.keys(parsed).join(", ")}\n`);

    process.stdout.write(`  articles returned: ${articles.length}\n\n`);

    const first = articles[0];

    if (first !== undefined) {
      process.stdout.write("  FIRST ARTICLE - the field schema we build from:\n\n");

      for (const [key, value] of Object.entries(first)) {
        process.stdout.write(
          `    ${key}: ${typeof value} = ${JSON.stringify(value)?.slice(0, 160)}\n`,
        );
      }

      process.stdout.write("\n  all article titles:\n");

      for (const article of articles) {
        process.stdout.write(`    - ${String(article.title)}\n`);
      }
    } else {
      process.stdout.write(`  ** no articles key - raw body: ${text.slice(0, 300)}\n`);
    }
  } catch {
    process.stdout.write(`  non-JSON body:\n  ${text.slice(0, 400)}\n`);
  }
} catch (error) {
  process.stdout.write(
    `  THREW after ${Date.now() - startedAt}ms: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
} finally {
  clearTimeout(timer);
}
