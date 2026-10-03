/**
 * Runs every normalizer against its captured raw file and writes the result.
 *
 *   npx tsx mcp/GDELT/testNormalizers.ts
 *
 * Output: mcp/GDELT/normalized/<tool>.json
 *
 * This is the check to run after editing a normalizer: it exercises all seven
 * against real captured payloads, so a field rename or a missed `?? null`
 * shows up as a `null` in the output rather than passing silently.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import "dotenv/config";

import { normalizeGdeltEvents } from "./normalizers/searchEvents.normalizer.js";
import { normalizeGdeltEvent } from "./normalizers/getEvents.normalizer.js";
import { normalizeGdeltStories } from "./normalizers/getSearchStories.normalizer.js";
import { normalizeGdeltStory } from "./normalizers/getStory.normalizer.js";
import { normalizeGdeltStoryArticles } from "./normalizers/getStoryArticles.js";
import { normalizeGdeltEventSummaries } from "./normalizers/summarizeEvents.normalizer.js";
import { normalizeGdeltStorySummaries } from "./normalizers/summarizeStories.normalizer.js";

const RAW_DIR = "mcp/GDELT/raw";
const OUT_DIR = "mcp/GDELT/normalized";

type Json = Record<string, unknown>;

const readRaw = async (file: string): Promise<Json> => {
  const text = await readFile(`${RAW_DIR}/${file}`, "utf8");
  return JSON.parse(text) as Json;
};

const writeOut = async (file: string, value: unknown): Promise<void> => {
  await writeFile(
    `${OUT_DIR}/${file}`,
    JSON.stringify(value, null, 2),
    "utf8",
  );
};

/** Pulls `_gdelt.payload.data` out of a captured file's envelope. */
const payloadData = (captured: Json): unknown =>
  (captured.response as Json | undefined)?._gdelt === undefined
    ? undefined
    : (
        (
          ((captured.response as Json)._gdelt as Json)
            .payload as Json
        )?.data
      );

const countFields = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.length > 0 && typeof value[0] === "object"
      ? Object.keys(value[0] as object).length
      : 0;
  }

  return value && typeof value === "object"
    ? Object.keys(value as object).length
    : 0;
};

const main = async (): Promise<void> => {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("");
  console.log("=".repeat(72));
  console.log("NORMALIZERS - all 7 against captured raw payloads");
  console.log("=".repeat(72));

  // --- search_events -> array of events --------------------------------
  const searchEvents = await readRaw("search_events.json");
  const events = normalizeGdeltEvents(
    (payloadData(searchEvents) ?? []) as never,
  );
  await writeOut("search_events.json", events);
  console.log(
    `  search_events      ${events.length} event(s), ${countFields(events)} fields each`,
  );

  // --- get_event -> single event ---------------------------------------
  const getEvent = await readRaw("get_event.json");
  const event = normalizeGdeltEvent({ response: getEvent.response });
  await writeOut("get_event.json", event);
  console.log(`  get_event          1 event, ${countFields(event)} fields`);

  // --- search_stories -> array of stories ------------------------------
  const searchStories = await readRaw("search_stories.json");
  const stories = normalizeGdeltStories(
    (payloadData(searchStories) ?? []) as never,
  );
  await writeOut("search_stories.json", stories);
  console.log(
    `  search_stories     ${stories.length} story/stories, ${countFields(stories)} fields each`,
  );

  // --- get_story -> single story ---------------------------------------
  const getStory = await readRaw("get_story.json");
  const story = normalizeGdeltStory({ response: getStory.response });
  await writeOut("get_story.json", story);
  console.log(`  get_story          1 story, ${countFields(story)} fields`);

  // --- get_story_articles -> array of articles -------------------------
  const articlesRaw = await readRaw("get_story_articles.json");
  const articles = normalizeGdeltStoryArticles(
    (payloadData(articlesRaw) ?? []) as never,
  );
  await writeOut("get_story_articles.json", articles);
  console.log(
    `  get_story_articles ${articles.length} article(s), ${countFields(articles)} fields each`,
  );

  // --- summarize_events -> array of buckets ----------------------------
  for (const [file, out] of [
    ["summarize_events.json", "summarize_events.json"],
    ["summarize_events.by-country.json", "summarize_events.by-country.json"],
  ] as const) {
    const captured = await readRaw(file);
    const buckets = normalizeGdeltEventSummaries({ response: captured.response });
    await writeOut(out, buckets);
    console.log(
      `  summarize_events   ${file.padEnd(34)} ${buckets.length} bucket(s), ${countFields(buckets)} fields each`,
    );
  }

  // --- summarize_stories -> array of buckets ---------------------------
  for (const [file, out] of [
    ["summarize_stories.json", "summarize_stories.json"],
    ["summarize_stories.by-category.json", "summarize_stories.by-category.json"],
  ] as const) {
    const captured = await readRaw(file);
    const buckets = normalizeGdeltStorySummaries({ response: captured.response });
    await writeOut(out, buckets);
    console.log(
      `  summarize_stories  ${file.padEnd(34)} ${buckets.length} bucket(s), ${countFields(buckets)} fields each`,
    );
  }

  console.log("");
  console.log(`Wrote normalized output to ${OUT_DIR}/`);
  console.log(
    "Review these and trim whichever fields the agents do not need.",
  );
};

main().catch((error: unknown) => {
  console.error("FAILED:", error);
  process.exitCode = 1;
});