export { fetchSearchEvents, fetchGetEvent } from "./events.js";
export { fetchSummarizeEvents } from "./summarizeEvents.js";
export { fetchSearchStories } from "./stories.js";
export {
  fetchSummarizeStories,
  fetchGetStory,
  fetchGetStoryArticles,
} from "./storyArticles.js";

export {
  DEFAULT_RECORD_LIMIT,
  GDELT_TARGET_TOOLS,
  GDELT_WRAPPER_TOOLS,
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

import { fetchGetEvent, fetchSearchEvents } from "./events.js";
import { fetchSummarizeEvents } from "./summarizeEvents.js";
import { fetchSearchStories } from "./stories.js";
import {
  fetchGetStory,
  fetchGetStoryArticles,
  fetchSummarizeStories,
} from "./storyArticles.js";
import type { RawGdeltResult } from "../gdeltClient.js";
import type {
  GetEventInput,
  GetStoryArticlesInput,
  GetStoryInput,
} from "../gdelt.types.js";

/**
 * Dispatch signature for the scripts.
 *
 * Deliberately loose: callers pass whatever they parsed from the command line,
 * and each fetcher narrows to its own input type internally. The by-id
 * fetchers require their id at runtime, which the scripts check before calling.
 */
export type GdeltFetcher = (
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<RawGdeltResult>;

/**
 * Tool name -> fetcher.
 *
 * The discovery scripts dispatch through this rather than calling
 * `callGdeltTool` directly. That matters: the `limit: 1` default lives inside
 * the fetchers, so a script that bypassed them silently captured 25 records
 * per file instead of 1.
 */
export const GDELT_FETCHERS: Record<string, GdeltFetcher> = {
  search_events: (input, signal) => fetchSearchEvents(input, signal),
  summarize_events: (input, signal) => fetchSummarizeEvents(input, signal),
  search_stories: (input, signal) => fetchSearchStories(input, signal),
  summarize_stories: (input, signal) => fetchSummarizeStories(input, signal),

  // The by-id fetchers take a narrower input type, so they are adapted here
  // rather than widening their signatures: they validate their own id.
  get_event: (input, signal) =>
    fetchGetEvent(input as GetEventInput, signal),
  get_story: (input, signal) => fetchGetStory(input as GetStoryInput, signal),
  get_story_articles: (input, signal) =>
    fetchGetStoryArticles(input as GetStoryArticlesInput, signal),
};