/**
 * Barrel for the seven GDELT Cloud fetchers - one file per tool.
 *
 *   searchEvents      summarizeEvents      getEvent
 *   searchStories     summarizeStories     getStory
 *   getStoryArticles
 *
 * Each fetcher maps 1:1 onto a tool the server exposes through
 * `gdelt_cloud_tool_call`. See `captureRaw.ts` for a runnable example and
 * `../raw/README.md` for what each response actually contains.
 */
import { fetchGetEvent } from "./getEvent.js";
import { fetchGetStory } from "./getStory.js";
import { fetchGetStoryArticles } from "./getStoryArticles.js";
import { fetchSearchEvents } from "./searchEvents.js";
import { fetchSearchStories } from "./searchStories.js";
import { fetchSummarizeEvents } from "./summarizeEvents.js";
import { fetchSummarizeStories } from "./summarizeStories.js";
import type { RawGdeltResult } from "../gdeltClient.js";
import type {
  GetEventInput,
  GetStoryArticlesInput,
  GetStoryInput,
} from "../gdelt.types.js";

export { fetchGetEvent } from "./getEvent.js";
export { fetchGetStory } from "./getStory.js";
export { fetchGetStoryArticles } from "./getStoryArticles.js";
export { fetchSearchEvents } from "./searchEvents.js";
export { fetchSearchStories } from "./searchStories.js";
export { fetchSummarizeEvents } from "./summarizeEvents.js";
export { fetchSummarizeStories } from "./summarizeStories.js";

/**
 * Dispatch signature.
 *
 * Deliberately loose: callers pass whatever they parsed from the command line
 * or config, and each fetcher narrows to its own input type internally. The
 * by-id fetchers validate their id at runtime.
 */
export type GdeltFetcher = (
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<RawGdeltResult>;

/**
 * Tool name -> fetcher.
 *
 * The discovery scripts dispatch through this rather than calling
 * `callGdeltTool` directly. `limit: 1` defaults live inside the list fetchers
 * (`withDefaultLimit`), so a script bypassing them would silently capture 25
 * records per file instead of 1.
 */
export const GDELT_FETCHERS: Record<string, GdeltFetcher> = {
  search_events: (input, signal) => fetchSearchEvents(input, signal),
  summarize_events: (input, signal) => fetchSummarizeEvents(input, signal),
  get_event: (input, signal) => fetchGetEvent(input as GetEventInput, signal),
  search_stories: (input, signal) => fetchSearchStories(input, signal),
  summarize_stories: (input, signal) => fetchSummarizeStories(input, signal),
  get_story: (input, signal) => fetchGetStory(input as GetStoryInput, signal),
  get_story_articles: (input, signal) =>
    fetchGetStoryArticles(input as GetStoryArticlesInput, signal),
};

// Re-exported so callers do not need a second import for the plumbing.
export {
  GDELT_TARGET_TOOLS,
  GDELT_WRAPPER_TOOLS,
  DEFAULT_RECORD_LIMIT,
  callGdeltTool,
  closeGdeltClient,
  getGdeltClient,
  readStructured,
  readText,
  withDefaultLimit,
  type GdeltTargetTool,
  type RawGdeltResult,
} from "../gdeltClient.js";

export type {
  GdeltCategory,
  GdeltContinent,
  GdeltRegion,
  GdeltSearchMode,
  GdeltStoryCategory,
  GetEventInput,
  GetStoryArticlesInput,
  GetStoryInput,
  SearchEventsInput,
  SearchStoriesInput,
  SummarizeEventsInput,
  SummarizeStoriesInput,
} from "../gdelt.types.js";