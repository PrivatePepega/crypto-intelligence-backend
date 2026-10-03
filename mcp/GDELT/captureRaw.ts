/**
 * Captures the raw response for every GDELT Cloud tool, for deciding what the
 * normalizers should keep.
 *
 *   npx tsx mcp/GDELT/captureRaw.ts
 *
 * Output, one file per tool, in mcp/GDELT/raw/:
 *
 *   search_events.json              search_events, no id needed
 *   summarize_events.json           summarize_events by date
 *   summarize_events.by-country.json the bucket shape changes with group_by
 *   get_event.json                  get_event, fed an id from search_events
 *   search_stories.json             search_stories, no id needed
 *   summarize_stories.json          summarize_stories by date
 *   summarize_stories.by-category.json
 *   get_story.json                  get_story, fed an id from search_stories
 *   get_story_articles.json         get_story_articles, fed the same story id
 *
 * ## The two summarize tools take a WINDOW, not an id
 *
 * `summarize_events` (GET /api/v2/events/summary) and `summarize_stories`
 * (GET /api/v2/stories/summary) are aggregate rollups, not record lookups:
 * they take a date window plus filters and bucket the result by `group_by`.
 * No id is accepted, and none is needed.
 *
 * They are NOT a summarised `search_events`. search_events returns individual
 * Event cards with ids and titles; summarize_events returns counts and metric
 * averages per bucket, with no ids at all. Both are wanted - the summary for
 * volume/trend questions, the search for the records themselves.
 *
 * That is also why each summarize tool is captured twice: `group_by: date`
 * returns 5-field buckets while `group_by: country` returns 40, so the field
 * inventory differs by grouping dimension and not only by tool.
 *
 * The three by-id tools ARE fed ids, chained from the searches in this same
 * script - see `readFirstId`.
 *
 * Raw payloads throughout: exactly what upstream sent, no normalization.
 */
import { mkdir, writeFile } from "node:fs/promises";
import "dotenv/config";

import {
  fetchGetEvent,
  fetchGetStory,
  fetchGetStoryArticles,
  fetchSearchEvents,
  fetchSearchStories,
} from "./fetchers/index.js";
import { closeGdeltClient, readStructured } from "./gdeltClient.js";

const OUT_DIR = "mcp/GDELT/raw";

/** Writes one tool's raw envelope to `raw/<file>.json`. */
const capture = async (
  tool: string,
  input: Record<string, unknown>,
  // Typed loosely because every fetcher returns the same RawGdeltResult shape;
  // `ReturnType<typeof fetchSearchEvents>` was a stand-in that broke as soon as
  // a differently-typed fetcher was passed in.
  result: { isError?: boolean; structuredContent?: unknown },
  file = tool,
): Promise<void> => {
  await writeFile(
    `${OUT_DIR}/${file}.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tool,
        args: input,
        isError: result.isError === true,
        response: readStructured(result),
      },
      null,
      2,
    ),
    "utf8",
  );
};

/**
 * Reads the first record's `id` from `_gdelt.payload.data`.
 *
 * Verified against live responses: search_stories returned `8608afb1d928` and
 * get_story returned a record with the same `id`. Ids are short hex strings
 * (stories) or family-prefixed hex (events, e.g. `conflict_574b2dc178a74941`),
 * not the record's `url`.
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
  const eventsResult = await fetchSearchEvents({ days: 3, sort: "significance" });
  await capture(
    "search_events",
    { days: 3, sort: "significance" },
    eventsResult,
  );
  console.log(`  search_events      ${countRecords(readStructured(eventsResult))} record(s)`);


  // --- get_event: fed the id from search_events ------------------------
  const eventId = readFirstId(readStructured(eventsResult));
  if (eventId) {
    const event = await fetchGetEvent({ event_id: eventId });
    await capture("get_event", { event_id: eventId }, event);
    console.log(`  get_event          id=${eventId}`);
  } else {
    console.log("  get_event          SKIPPED - search_events returned nothing");
  }

  // --- search_stories: the source of the story id ----------------------
  const storiesResult = await fetchSearchStories({ days: 3, sort: "significance" });
  await capture(
    "search_stories",
    { days: 3, sort: "significance" },
    storiesResult,
  );
  console.log(
    `  search_stories     ${countRecords(readStructured(storiesResult))} record(s)`,
  );




  // --- get_story / get_story_articles: fed the same story id -----------
  const storyId = readFirstId(readStructured(storiesResult));
  if (storyId) {
    const story = await fetchGetStory({ story_id: storyId });
    await capture("get_story", { story_id: storyId }, story);
    console.log(`  get_story          id=${storyId}`);

    const articles = await fetchGetStoryArticles({ story_id: storyId });
    await capture("get_story_articles", { story_id: storyId }, articles);
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