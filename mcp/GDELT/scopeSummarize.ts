/**
 * What a summarize tool CAN be scoped by, and the flow that actually exists.
 *
 * `summarize_events` / `summarize_stories` accept no id parameter - probed in
 * `probeSummarizeId.ts`, where passing `event_id`, `id`, `event_ids` or
 * `entity` all returned byte-identical results (22,068 events), i.e. the key
 * was silently dropped. Their 33 / 21 accepted parameters are all filters.
 *
 * So the way to tie a summarize to a searched record is to scope it by that
 * record's own dimensions: its date, country, category. This script does that
 * for a real event and a real story, then shows the summary -> search discovery
 * flow the docs describe.
 *
 * Run: npx tsx mcp/GDELT/scopeSummarize.ts
 * Out: mcp/GDELT/normalized/scoped-*.json and raw/summarize.scoped-*.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import "dotenv/config";

import {
  fetchSearchEvents,
  fetchSearchStories,
  fetchSummarizeEvents,
  fetchSummarizeStories,
} from "./fetchers/index.js";
import { closeGdeltClient, readStructured } from "./gdeltClient.js";
import { normalizeGdeltEventSummaries } from "./normalizers/summarizeEvents.normalizer.js";
import { normalizeGdeltStorySummaries } from "./normalizers/summarizeStories.normalizer.js";
import type {
  SearchEventsInput,
  SummarizeEventsInput,
  SummarizeStoriesInput,
} from "./gdelt.types.js";

const NORMALIZED_DIR = "mcp/GDELT/normalized";
const RAW_DIR = "mcp/GDELT/raw";

type Json = Record<string, unknown>;

const payloadOf = (structured: unknown): Json | undefined =>
  (
    structured as {
      _gdelt?: { payload?: Json };
    }
  )?._gdelt?.payload;

const firstRecord = (structured: unknown): Json | undefined => {
  const data = payloadOf(structured)?.data;
  return Array.isArray(data) ? (data[0] as Json) : (data as Json | undefined);
};

const write = async (dir: string, file: string, value: unknown): Promise<void> => {
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${file}`, JSON.stringify(value, null, 2), "utf8");
};

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(72));
  console.log("SCOPING A SUMMARIZE TO A SEARCHED RECORD");
  console.log("=".repeat(72));

  // ---- events ----------------------------------------------------------
  const searchInput: SearchEventsInput = { days: 3, sort: "significance" };
  const eventsResult = await fetchSearchEvents(searchInput);
  const eventsPayload = payloadOf(readStructured(eventsResult));
  const card = firstRecord(readStructured(eventsResult));

  const eventId = card?.id as string | undefined;
  const eventDate = card?.event_date as string | undefined;
  const category = card?.category as string | undefined;
  const country = (card?.geo as Json | undefined)?.country as string | undefined;

  console.log("");
  console.log(`  search_events -> event ${eventId}`);
  console.log(`    event_date : ${eventDate}`);
  console.log(`    category   : ${category}`);
  console.log(`    country    : ${country}`);

  // The summarize is scoped by the card's OWN dimensions, not by its id.
  const scopedInput = {
    group_by: "date",
    ...(eventDate ? { start_date: eventDate, end_date: eventDate } : { days: 3 }),
    ...(country ? { country: [country] } : {}),
    ...(category ? { category } : {}),
  } as SummarizeEventsInput;

  console.log("");
  console.log(`  summarize_events scoped to that event's slice:`);
  console.log(`    ${JSON.stringify(scopedInput)}`);

  const scopedResult = await fetchSummarizeEvents(scopedInput);
  const scopedPayload = payloadOf(readStructured(scopedResult));
  const scopedBuckets = normalizeGdeltEventSummaries({
    response: readStructured(scopedResult),
  });

  await write(
    RAW_DIR,
    "summarize_events.scoped.json",
    {
      generatedAt: new Date().toISOString(),
      tool: "summarize_events",
      args: scopedInput,
      isError: scopedResult.isError === true,
      response: readStructured(scopedResult),
    },
  );
  await write(NORMALIZED_DIR, "summarize_events.scoped.json", scopedBuckets);

  console.log(`    -> ${scopedBuckets.length} bucket(s)`);
  scopedBuckets.forEach((b) => {
    console.log(
      `       key=${b.key}  eventCount=${b.eventCount}  ` +
        `conflict=${b.conflictEventCount}  fatal=${b.fatalities}`,
    );
  });

  // ---- the flow that exists: summary -> search ------------------------
  console.log("");
  console.log("=".repeat(72));
  console.log("SUMMARY -> SEARCH: the documented discovery flow");
  console.log("=".repeat(72));

  // summarize_events(group_by=subcategory) surfaces the sub-codes that
  // actually carry events; those then feed search_events.
  const discoveryResult = await fetchSummarizeEvents({
    group_by: "subcategory",
    category: "Battles",
    days: 7,
  });

  const discovered = normalizeGdeltEventSummaries({
    response: readStructured(discoveryResult),
  });

  console.log("");
  console.log(
    `  summarize_events(group_by=subcategory, category=Battles) -> ${discovered.length} bucket(s)`,
  );
  discovered.slice(0, 6).forEach((b) => {
    console.log(`    ${String(b.key).padEnd(38)} events=${b.eventCount}`);
  });

  const top = discovered
    .filter((b) => typeof b.key === "string")
    .sort((a, b) => (b.eventCount ?? 0) - (a.eventCount ?? 0))[0];

  if (top?.key) {
    console.log("");
    console.log(`  Feeding the top bucket back into search_events:`);
    console.log(`    category=Battles  subcategory="${top.key}"`);

    const drilled = await fetchSearchEvents({
      category: "Battles",
      subcategory: top.key,
      days: 7,
      limit: 3,
    });

    const drilledRecords = (
      payloadOf(readStructured(drilled))?.data ?? []
    ) as Json[];

    console.log(`    -> ${drilledRecords.length} event(s)`);
    drilledRecords.forEach((r) => {
      console.log(`       ${String(r.id).padEnd(30)} ${String(r.title).slice(0, 52)}`);
    });

    await write(
      RAW_DIR,
      "summarize_events.discovery.json",
      {
        generatedAt: new Date().toISOString(),
        note:
          "summarize_events(group_by=subcategory) -> the sub-codes that " +
          "actually carry events, then feed them back into search_events.",
        discoveryArgs: { group_by: "subcategory", category: "Battles", days: 7 },
        discoveredBuckets: discovered,
        drillDownArgs: {
          category: "Battles",
          subcategory: top.key,
          days: 7,
          limit: 3,
        },
        events: drilledRecords,
      },
    );
  }

  // ---- stories ---------------------------------------------------------
  console.log("");
  console.log("=".repeat(72));
  console.log("STORIES: scoping a summarize to a searched story");
  console.log("=".repeat(72));

  const storiesResult = await fetchSearchStories({ days: 3, sort: "significance" });
  const story = firstRecord(readStructured(storiesResult));

  const storyId = story?.id as string | undefined;
  const storyDate = story?.story_date as string | undefined;
  const storyCountry = (story?.geo as Json | undefined)?.country as string | undefined;
  const storyCategory = story?.category_code as string | undefined;

  console.log("");
  console.log(`  search_stories -> story ${storyId}`);
  console.log(`    story_date   : ${storyDate}`);
  console.log(`    category_code: ${storyCategory}`);
  console.log(`    country      : ${storyCountry}`);

  // Annotated explicitly: a conditional spread infers a union that the
  // fetcher's parameter type will not accept.
  const scopedStoriesInput: SummarizeStoriesInput = {
    group_by: "date",
    ...(storyDate
      ? { start_date: storyDate, end_date: storyDate }
      : { days: 3 }),
    ...(storyCountry ? { country: [storyCountry] } : {}),
  };

  console.log("");
  console.log(`  summarize_stories scoped to that story's slice:`);
  console.log(`    ${JSON.stringify(scopedStoriesInput)}`);

  const scopedStoriesResult = await fetchSummarizeStories(scopedStoriesInput);
  const scopedStoryBuckets = normalizeGdeltStorySummaries({
    response: readStructured(scopedStoriesResult),
  });

  await write(
    RAW_DIR,
    "summarize_stories.scoped.json",
    {
      generatedAt: new Date().toISOString(),
      tool: "summarize_stories",
      args: scopedStoriesInput,
      isError: scopedStoriesResult.isError === true,
      response: readStructured(scopedStoriesResult),
    },
  );
  await write(
    NORMALIZED_DIR,
    "summarize_stories.scoped.json",
    scopedStoryBuckets,
  );

  console.log(`    -> ${scopedStoryBuckets.length} bucket(s)`);
  scopedStoryBuckets.forEach((b) => {
    console.log(
      `       key=${b.key}  storyCount=${b.storyCount}  ` +
        `withEvents=${b.storiesWithEvents}  linkedEvents=${b.linkedEventCount}`,
    );
  });

  console.log("");
  console.log(`Wrote scoped raw + normalized output.`);
};

main()
  .catch((error: unknown) => {
    console.error("FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeGdeltClient();
  });