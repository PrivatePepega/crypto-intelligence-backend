import { mkdir, writeFile } from "node:fs/promises";

import {
  fetchSection,
  isNewsMarketsConfigured,
  NewsMarketsApiError,
  NEWSMARKETS_SECTIONS,
  readArray,
  readGeneratedAt,
  type NewsMarketsSection,
} from "./client.js";

/**
 * Capture the NewsMarkets sections this integration uses.
 *
 * Run: npx tsx mcp/newsMarkets/newsMarkets.test.ts
 *
 * Out: mcp/newsMarkets/raw/section-<name>.json
 *
 * ## Scope
 *
 * Four sections, chosen to cover the domains this backend tracks:
 *
 *   ai        AI and machine intelligence
 *   business  markets, companies and finance
 *   crypto    digital assets
 *   tech      technology and software
 *
 * The API publishes 13 sections. The other nine were captured, reviewed and
 * dropped as out of scope: `politics`, `world`, `sports`, `culture`, `music`,
 * `health`, `science`, `weather`, `startups`.
 *
 * The front page, trending, signals and topic routes are **not** captured
 * either. They remain available in `client.ts` - this is a scoping decision
 * about what to normalize, not a removal from the API surface.
 *
 * ## Pacing
 *
 * A {@link GAP_MS} pause separates calls. The server is a static snapshot on
 * Cloudflare Workers with no documented limit, so this is politeness rather than
 * necessity.
 *
 * ## Not a test
 *
 * No assertions. The purpose is to capture real payloads so the fields worth
 * normalizing can be chosen from data.
 */

/** Pause between calls, in milliseconds. Override with `NEWSMARKETS_GAP_MS`. */
const GAP_MS = Number(process.env.NEWSMARKETS_GAP_MS ?? 3000);

const RAW_DIR = "mcp/newsMarkets/raw";

/** Sections captured, in the order they are requested. */
const SECTIONS: NewsMarketsSection[] = ["ai", "business", "crypto", "tech"];

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("NEWSMARKETS SECTION DISCOVERY");
  console.log("=".repeat(70));
  console.log(`  configured : ${isNewsMarketsConfigured()}`);
  console.log(`  gap        : ${GAP_MS}ms`);
  console.log(`  sections   : ${SECTIONS.join(", ")}`);
  console.log(`  of ${NEWSMARKETS_SECTIONS.length} available`);

  if (!isNewsMarketsConfigured()) {
    process.exitCode = 1;

    return;
  }

  await mkdir(RAW_DIR, { recursive: true });

  const report: Record<string, unknown>[] = [];

  let ok = 0;
  let failed = 0;

  for (const [index, section] of SECTIONS.entries()) {
    const path = `/data/v1/sections/${section}.json`;

    console.log("");
    console.log(`  GET ${path}`);

    const startedAt = Date.now();

    try {
      const payload = await fetchSection(section);

      const elapsed = Date.now() - startedAt;

      const size = JSON.stringify(payload).length;

      const stories = readArray<Record<string, unknown>>(payload, "stories");

      // `noUncheckedIndexedAccess` makes the index `| undefined` regardless of
      // the length check, so it is defaulted rather than guarded.
      const storyFields = Object.keys(stories[0] ?? {});

      ok += 1;

      console.log(
        `    OK ${elapsed}ms  ${size} chars  ` +
          `generated_at=${readGeneratedAt(payload)}`,
      );
      console.log(
        `    section=${String(
          (payload as { section?: unknown }).section ?? "?",
        )}  total=${String((payload as { total?: unknown }).total ?? "?")}  ` +
          `stories=${stories.length}`,
      );

      if (storyFields.length > 0) {
        console.log(`    story fields (${storyFields.length}): ${storyFields.join(", ")}`);
      }

      report.push({
        section,
        path,
        ok: true,
        elapsedMs: elapsed,
        sizeChars: size,
        generatedAt: readGeneratedAt(payload),
        storyCount: stories.length,
        storyFields,
      });

      await writeFile(
        `${RAW_DIR}/section-${section}.json`,
        JSON.stringify(
          {
            label: `GET ${path}`,
            section,
            capturedAt: new Date().toISOString(),
            elapsedMs: elapsed,
            generatedAt: readGeneratedAt(payload),
            storyCount: stories.length,
            storyFields,
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

      report.push({ section, path, ok: false, error: message });

      await writeFile(
        `${RAW_DIR}/section-${section}.json`,
        JSON.stringify(
          {
            label: `GET ${path}`,
            section,
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

    if (index < SECTIONS.length - 1 && GAP_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    }
  }

  console.log("");
  console.log("=".repeat(70));
  console.log(`  probed  : ${SECTIONS.length}`);
  console.log(`  ok      : ${ok}`);
  console.log(`  failed  : ${failed}`);
  console.log(`  captures: ${RAW_DIR}/`);

  // Whether the four sections came from one snapshot or several.
  const stamps = [
    ...new Set(report.map((entry) => entry.generatedAt).filter(Boolean)),
  ];

  console.log(
    stamps.length <= 1
      ? `  snapshot: generated_at=${stamps[0]}`
      : `  snapshot: ${stamps.length} distinct generated_at values`,
  );

  console.log("=".repeat(70));
};

main().catch((error: unknown) => {
  console.error("");
  console.error("DISCOVERY FAILED");
  console.error("----------------------------------------------");
  console.error(error);

  process.exitCode = 1;
});