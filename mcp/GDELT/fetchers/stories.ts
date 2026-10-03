import { callGdeltTool, withDefaultLimit } from "../gdeltClient.js";
import type { SearchStoriesInput } from "../gdelt.types.js";

/**
 * search_stories - clustered narrative coverage.
 *
 * 36 input parameters. Returns the same envelope as search_events:
 * `{ success, data, applied_filters, pagination, sort }`.
 *
 * `limit` defaults to 1 for readable fixtures. Pass `limit` explicitly for
 * volume.
 */
export const fetchSearchStories = async (
  input: SearchStoriesInput = {},
  signal?: AbortSignal,
) => callGdeltTool("search_stories", withDefaultLimit(input), signal);