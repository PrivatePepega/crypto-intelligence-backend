import { mkdir, writeFile } from "node:fs/promises";

import {
  fetchFront,
  fetchSection,
  fetchSignals,
  fetchTopic,
  fetchTopicsIndex,
  fetchTrending,
  isNewsMarketsConfigured,
  NewsMarketsApiError,
  NEWSMARKETS_SECTIONS,
  prop,
  readArray,
  readGeneratedAt,
  type NewsMarketsSection,
} from "./client.js";

/**
 * Hit every NewsMarkets endpoint and record what comes back.
 *
 * Run: npx tsx mcp/newsMarkets/newsMarkets.test.ts
 *
 * Out: mcp/newsMarkets/raw/<slug>.json - one file per endpoint.
 *
 * ## Pacing
 *
 * A {@link GAP_MS} pause separates calls. The server is a static snapshot on
 * Cloudflare Workers with no documented limit, so this is politeness rather than
 * necessity - but the payload for the front page is large and re-fetching it in
 * a tight loop serves no purpose.
 *
 * ## Not a test
 *
 * No assertions. The point is to capture real payloads so the fields worth
 * normalizing can be chosen from data. A failed call still writes a file.
 */

/** Pause between calls, in milliseconds. Override with `NEWSMARKETS_GAP_MS`. */
const GAP_MS = Number(process.env.NEWSMARKETS_GAP_MS ?? 3000);

const RAW_DIR = "mcp/newsMarkets/raw";

/** Sections captured. `crypto` leads, being the one this backend cares most
 *  about; the rest give coverage of the section shape. */
const SECTIONS: NewsMarketsSection[] = [
  "crypto",
  "business",
  "tech",
  "ai",
  "politics",
  "world",
  "sports",
  "health",
  "startups",
  "science",
  "weather",
  "culture",
  "music",
];

/**
 * A topic slug to capture, taken from the index at run time.
 *
 * Hardcoding a slug would rot as topics are added, so the first entry of
 * `/topics/index.json` is used instead.
 */
const TOPIC_FALLBACK = "donald-trump";

interface Target {
  slug: string;
  label: string;
  path: string;
  call: () => Promise<unknown>;
}

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("NEWSMARKETS ENDPOINT DISCOVERY");
  console.log("=".repeat(70));
  console.log(`  configured : ${isNewsMarketsConfigured()}`);
  console.log(`  gap        : ${GAP_MS}ms`);
  console.log(`  sections   : ${SECTIONS.length} of ${NEWSMARKETS_SECTIONS.length}`);

  if (!isNewsMarketsConfigured()) {
    process.exitCode = 1;

    return;
  }

  await mkdir(RAW_DIR, { recursive: true });

  // --- built from the data, so it stays valid as topics change ---
  let topicSlug = TOPIC_FALLBACK;

  try {
    const index = await fetchTopicsIndex();

    const first = readArray<{ slug?: string }>(index, "topics")[0];

    if (first?.slug) {
      topicSlug = first.slug;
    }
  } catch {
    // Fall back to the hardcoded slug; the fetch below will record the failure.
  }

  console.log(`  topic slug : ${topicSlug}  (taken from topics/index)`);

  const TARGETS: Target[] = [
    { slug: "front", label: "GET /data/v1/front.json", path: "/data/v1/front.json", call: () => fetchFront() },
    { slug: "trending", label: "GET /data/v1/trending.json", path: "/data/v1/trending.json", call: () => fetchTrending() },
    { slug: "signals", label: "GET /data/v1/signals.json", path: "/data/v1/signals.json", call: () => fetchSignals() },
    { slug: "topics-index", label: "GET /data/v1/topics/index.json", path: "/data/v1/topics/index.json", call: () => fetchTopicsIndex() },
    { slug: "topic", label: `GET /data/v1/topics/${topicSlug}.json`, path: `/data/v1/topics/${topicSlug}.json`, call: () => fetchTopic(topicSlug) },

    ...SECTIONS.map<Target>((section) => ({
      slug: `section-${section}`,
      label: `GET /data/v1/sections/${section}.json`,
      path: `/data/v1/sections/${section}.json`,
      call: () => fetchSection(section),
    })),
  ];

  const report: Record<string, unknown>[] = [];

  let ok = 0;
  let failed = 0;

  for (const [index, target] of TARGETS.entries()) {
    console.log("");
    console.log(`  ${target.label}`);

    const startedAt = Date.now();

    try {
      const payload = await target.call();

      const elapsed = Date.now() - startedAt;

      const size = JSON.stringify(payload).length;

      ok += 1;

      const topKeys =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? Object.keys(payload as Record<string, unknown>)
          : [];

      console.log(`    OK ${elapsed}ms  ${size} chars  generated_at=${readGeneratedAt(payload)}`);
      console.log(`    top-level keys: ${topKeys.join(", ")}`);

      // Count the array fields, so the shape is visible without dumping bodies.
      const arraySizes: string[] = [];

      for (const key of topKeys) {
        const value = (payload as Record<string, unknown>)[key];

        if (Array.isArray(value)) {
          arraySizes.push(`${key}[${value.length}]`);
        } else if (value && typeof value === "object") {
          arraySizes.push(`${key}{${Object.keys(value as object).length}}`);
        }
      }

      if (arraySizes.length > 0) {
        console.log(`    collections: ${arraySizes.join("  ")}`);
      }

      // First story's fields, where there is one. `readArray` is generic, so
      // the element type is pinned here to keep `Object.keys` happy, and the
      // index is defaulted because `noUncheckedIndexedAccess` makes it
      // `| undefined` regardless of the length check.
      const stories = readArray<Record<string, unknown>>(payload, "stories");
      const storyFields = Object.keys(stories[0] ?? {});

      if (storyFields.length > 0) {
        console.log(
          `    story fields (${storyFields.length}): ${storyFields.join(", ")}`,
        );
      }

      report.push({
        label: target.label,
        path: target.path,
        ok: true,
        elapsedMs: elapsed,
        sizeChars: size,
        generatedAt: readGeneratedAt(payload),
        topLevelKeys: topKeys,
        collections: arraySizes,
        storyFields,
      });

      await writeFile(
        `${RAW_DIR}/${target.slug}.json`,
        JSON.stringify(
          {
            label: target.label,
            path: target.path,
            capturedAt: new Date().toISOString(),
            elapsedMs: elapsed,
            generatedAt: readGeneratedAt(payload),
            response: payload,
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch (error) {
      failed += 1;

      const isApiError = error instanceof NewsMarketsApiError;

      const message = error instanceof Error ? error.message : String(error);

      console.log(`    ${isApiError ? "REFUSED" : "ERROR"} ${Date.now() - startedAt}ms`);
      console.log(`    ${message.replace(/\s+/g, " ").slice(0, 200)}`);

      report.push({
        label: target.label,
        path: target.path,
        ok: false,
        error: message,
      });

      await writeFile(
        `${RAW_DIR}/${target.slug}.json`,
        JSON.stringify(
          {
            label: target.label,
            path: target.path,
            capturedAt: new Date().toISOString(),
            ok: false,
            error: message,
          },
          null,
          2,
        ),
        "utf8",
      );
    }

    if (index < TARGETS.length - 1 && GAP_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    }
  }

  console.log("");
  console.log("=".repeat(70));
  console.log(`  probed : ${TARGETS.length}`);
  console.log(`  ok     : ${ok}`);
  console.log(`  failed : ${failed}`);
  console.log(`  captures: ${RAW_DIR}/`);

  // Report whether every payload came from the same snapshot.
  const stamps = [
    ...new Set(report.map((entry) => entry.generatedAt).filter(Boolean)),
  ];

  console.log(
    stamps.length === 1
      ? `  snapshot: all payloads share generated_at=${stamps[0]}`
      : `  snapshot: ${stamps.length} distinct generated_at values`,
  );

  console.log("=".repeat(70));
};

void main().catch((error: unknown) => {
  console.error("");
  console.error("DISCOVERY FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});