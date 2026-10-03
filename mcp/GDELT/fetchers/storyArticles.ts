import { callGdeltTool, withDefaultLimit } from "../gdeltClient.js";
import type {
  GetStoryArticlesInput,
  GetStoryInput,
  SummarizeStoriesInput,
} from "../gdelt.types.js";

/**
 * summarize_stories - aggregate rollup for Stories.
 *
 * Returns `{ success, group_by, data, applied_filters }`. `limit` caps the
 * number of buckets and defaults to 1 for readable fixtures.
 *
 * A Story has no source/target actor of its own, so this endpoint does not
 * accept the actor dimensions that summarize_events does.
 */
export const fetchSummarizeStories = async (
  input: SummarizeStoriesInput = {},
  signal?: AbortSignal,
) => {
  if (input.days !== undefined && (input.days < 1 || input.days > 30)) {
    throw new Error("days must be between 1 and 30.");
  }

  return callGdeltTool("summarize_stories", withDefaultLimit(input), signal);
};

/**
 * get_story - one Story by id.
 *
 * Returns a single record as an object, not an array: the by-id tools behave
 * differently from the list tools.
 */
export const fetchGetStory = async (input: GetStoryInput, signal?: AbortSignal) => {
  if (!input.story_id) {
    throw new Error("story_id is required.");
  }

  return callGdeltTool("get_story", input, signal);
};

/**
 * get_story_articles - the articles backing one Story.
 *
 * Returns the list envelope `{ success, data, applied_filters, pagination,
 * sort }`, so this is the tool that produces citable source documents.
 *
 * `limit` defaults to 1 for readable fixtures. Note that upstream's `digest`
 * for this tool echoes the parent Story's fields rather than the article's, so
 * article data only appears under `_gdelt.payload.data`.
 */
export const fetchGetStoryArticles = async (
  input: GetStoryArticlesInput,
  signal?: AbortSignal,
) => {
  if (!input.story_id) {
    throw new Error("story_id is required.");
  }

  return callGdeltTool("get_story_articles", withDefaultLimit(input), signal);
};