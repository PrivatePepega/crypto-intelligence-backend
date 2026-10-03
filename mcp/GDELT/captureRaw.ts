/**
 * Captures the raw response for every GDELT Cloud tool, for deciding what the
 * normalizers should keep.
 *
 *   npx tsx mcp/GDELT/captureRaw.ts
 *
 * Output, one file per tool, in mcp/GDELT/raw/:
 *
 *   search_events.json        search_events, no id needed
 *   summarize_events.json     summarize_events by date
 *   summarize_events.by-country.json   the bucket shape changes with group_by
 *   get_event.json            get_event, fed an id from search_events
 *   search_stories.json       search_stories, no id needed
 *   summarize_stories.json    summarize_stories by date
 *   summarize_stories.by-category.json
 *   get_story.json            get_story, fed an id from search_stories
 *   get_story_articles.json   get_story_articles, fed the same story id
 *
 * ## The two summarize tools do NOT take an id
 *
 * They are aggregate rollups, not record lookups: they take a window
 * (`days` / `start_date` / `end_date`) plus filters, and bucket the result by
 * `group_by`. So nothing needs to feed them an id - they need a window, and
 * each `group_by` returns a differently shaped bucket.
 *
 * That is why each summarize tool is captured twice here. `group_by: date`
 * buckets read `{ key, latest_date, event_count, ... }`, while
 * `group_by: country` buckets read `{ key, country_count, region_count, ... }`
 * with no date field. Deciding what to normalize needs both, because the fields
 * differ by grouping dimension rather than only by tool.
 *
 * The three by-id tools ARE fed ids, chained from the searches in this same
 * script - see `readFirstId`.
 *
 * Raw payloads throughout: exactly what upstream sent, no normalization.
 */
import { mkdir, writeFile } from "node:fs/promises";
import "dotenv/config";

import { GDELT_FETCHERS } from "./fetchers/index.js";
import { closeGdeltClient, readStructured } from "./gdeltClient.js";

const OUT_DIR = "mcp/GDELT/raw";

/** Writes one tool's raw envelope to `raw/<file>.json`. */
const capture = async (
  tool: string,
  input: Record<string, unknown>,
  file = tool,
): Promise<unknown> => {
  const fetcher = GDELT_FETCHERS[tool];

  if (!fetcher) {
    throw new Error(`No fetcher registered for "${tool}".`);
  }

  const result = await fetcher(input);
  const structured = readStructured(result);

  await writeFile(
    `${OUT_DIR}/${file}.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tool,
        args: input,
        isError: result.isError === true,
        response: structured,
      },
      null,
      2,
    ),
    "utf8",
  );

  return structured;
};

/**
 * Reads the first record's `id` from `_gdelt.payload.data`.
 *
 * Verified against live responses: search_stories returned `3bba6f6d6d7c` and
 * get_story returned a record with the same `id`. Ids are short hex strings
 * (stories) or family-prefixed hex (events, e.g. `conflict_22923136a...`), not
 * the record's `url`.
 */
const readFirstId = (structured: unknown): string | undefined => {
  const data = (
    structured as { _gdelt?: { payload?: { data?: unknown } } } | undefined
  )?._gdelt?.payload?.data;

  const record = Array.isArray(data)
    ? data[0]
    : data && typeof data === "object"
      ? data
      : undefined;

  const id = (record as { id?: unknown } | undefined)?.id;

  return typeof id === "string" && id.length > 0 ? id : undefined;
};

/** Counts buckets/records for the console summary. */
const countRecords = (structured: unknown): number => {
  const data = (
    structured as { _gdelt?: { payload?: { data?: unknown } } } | undefined
  )?._gdelt?.payload?.data;

  return Array.isArray(data) ? data.length : data ? 1 : 0;
};

const main = async (): Promise<void> => {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("");
  console.log("=".repeat(72));
  console.log("GDELT RAW CAPTURE - all 7 tools");
  console.log("=".repeat(72));

  // --- search_events: the source of the event id -----------------------
  const events = await capture("search_events", {
    days: 3,
    sort: "significance",
  });
  console.log(`  search_events      ${countRecords(events)} record(s)`);

  // --- summarize_events: window + group_by, no id ----------------------
  const sumEventsDate = await capture("summarize_events", {
    group_by: "date",
    days: 7,
  });
  console.log(
    `  summarize_events   group_by=date    ${countRecords(sumEventsDate)} bucket(s)`,
  );

  await capture(
    "summarize_events",
    { group_by: "country", days: 7 },
    "summarize_events.by-country",
  );
  console.log("  summarize_events   group_by=country captured");

  // --- get_event: fed the id from search_events ------------------------
  const eventId = readFirstId(events);
  if (eventId) {
    await capture("get_event", { event_id: eventId });
    console.log(`  get_event          id=${eventId}`);
  } else {
    console.log("  get_event          SKIPPED - search_events returned nothing");
  }

  // --- search_stories: the source of the story id ----------------------
  const stories = await capture("search_stories", {
    days: 3,
    sort: "significance",
  });
  console.log(`  search_stories     ${countRecords(stories)} record(s)`);

  // --- summarize_stories: window + group_by, no id ---------------------
  const sumStoriesDate = await capture("summarize_stories", {
    group_by: "date",
    days: 7,
  });
  console.log(
    `  summarize_stories  group_by=date    ${countRecords(sumStoriesDate)} bucket(s)`,
  );

  await capture(
    "summarize_stories",
    { group_by: "category", days: 7 },
    "summarize_stories.by-category",
  );
  console.log("  summarize_stories  group_by=category captured");

  // --- get_story / get_story_articles: fed the same story id -----------
  const storyId = readFirstId(stories);
  if (storyId) {
    await capture("get_story", { story_id: storyId });
    console.log(`  get_story          id=${storyId}`);

    await capture("get_story_articles", { story_id: storyId });
    console.log(`  get_story_articles id=${storyId}`);
  } else {
    console.log(
      "  get_story, get_story_articles  SKIPPED - search_stories returned nothing",
    );
  }

  console.log("");
  console.log(`Wrote raw responses to ${OUT_DIR}/`);
};

main()
  .catch((error: unknown) => {
    console.error("FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeGdeltClient();
  });