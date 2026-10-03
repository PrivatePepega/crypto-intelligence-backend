import {
  callGdeltTool,
  withDefaultLimit,
  type RawGdeltResult,
} from "../gdeltClient.js";
import type { SummarizeStoriesInput } from "../gdelt.types.js";

/**
 * Parameters the endpoint deliberately rejects with a 400.
 *
 * Checked client-side because the MCP dispatcher silently DROPS undeclared
 * keys rather than forwarding them — verified by passing `search` and `cursor`
 * and getting `isError: false` with an unchanged result. Rejecting here turns a
 * silent wrong answer into a clear error.
 */
const REJECTED_PARAMS = [
  "search",
  "sort",
  "cursor",
  "offset",
  "include_images",
  "include_entity_images",
  "geo_scope",
  "scope",
  "detail",
  "cluster_certainty",
  "quad_class",
  "as_of",
] as const;

/**
 * `summarize_stories` - aggregate counts over clustered Stories.
 *
 * Backing endpoint: `GET /api/v2/stories/summary`. Coverage begins 2026-03-08.
 *
 * ## Not a summarised search
 *
 * One bucket per group, no ids. Use `fetchSearchStories` for the records.
 *
 * ## `limit` works here
 *
 * Caps buckets (default 50, max 500). Measured:
 * `limit 3 -> 3 buckets`, `limit 10 -> 10`, and `limit 20 -> 11` where only 11
 * categories existed. Note `group_by: date` is the one grouping where
 * `summarize_events` ignores `limit`.
 *
 * ## No actor dimensions
 *
 * A Story has no source/target actor of its own, so `source_actor_country` and
 * `target_actor_country` are not offered here. Its groupings are
 * `date | country | region | continent | category | subcategory |
 * story_category | event_category`.
 *
 * ## Read `notice`
 *
 * The envelope carries `notice` and `counting_basis`, which
 * `summarize_events` does not have. An empty `data` means **no coverage** for
 * that filter combination, not zero activity.
 *
 * Its `metrics` block is narrower too - 4 keys against the events version's 7,
 * with no goldstein or CAMEO+ sub-scores.
 */
export const fetchSummarizeStories = async (
  input: SummarizeStoriesInput = {},
  signal?: AbortSignal,
): Promise<RawGdeltResult> => {
  if (input.days !== undefined && (input.days < 1 || input.days > 30)) {
    throw new Error("days must be between 1 and 30 for summarize_stories.");
  }

  const rejected = REJECTED_PARAMS.filter((key) => key in input);
  if (rejected.length > 0) {
    throw new Error(
      `summarize_stories does not accept: ${rejected.join(", ")}. ` +
        `Use fetchSearchStories for search/sort/cursor, or narrow the window.`,
    );
  }

  return callGdeltTool("summarize_stories", withDefaultLimit(input), signal);
};