import { callGdeltTool, withDefaultLimit } from "../gdeltClient.js";
import type { SummarizeEventsInput } from "../gdelt.types.js";

/**
 * summarize_events - aggregate rollup grouped by `group_by`.
 *
 * Returns `{ success, group_by, data, applied_filters }`.
 *
 * `limit` here caps the number of aggregate BUCKETS, not records. It defaults
 * to 1 so a captured fixture shows one bucket's shape; pass `limit` explicitly
 * for a full rollup.
 *
 * Two upstream constraints that matter when normalising later:
 *   - no cursor pagination; each date chunk must be requested separately
 *   - no semantic search filter, so `search` is not accepted here
 */
export const fetchSummarizeEvents = async (
  input: SummarizeEventsInput = {},
  signal?: AbortSignal,
) => {
  if (input.days !== undefined && (input.days < 1 || input.days > 30)) {
    throw new Error("days must be between 1 and 30.");
  }

  return callGdeltTool("summarize_events", withDefaultLimit(input), signal);
};