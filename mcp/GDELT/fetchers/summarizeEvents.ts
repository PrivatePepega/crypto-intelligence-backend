import {
  callGdeltTool,
  withDefaultLimit,
  type RawGdeltResult,
} from "../gdeltClient.js";
import type { SummarizeEventsInput } from "../gdelt.types.js";

/**
 * Parameters the endpoint deliberately rejects with a 400.
 *
 * Listed so the fetcher can reject them client-side. That matters because the
 * MCP dispatcher (`gdelt_cloud_tool_call`) silently DROPS undeclared keys
 * instead of forwarding them: verified by passing `search` and `cursor` here,
 * both documented as 400, and both returning `isError: false` with an
 * unchanged result. A caller passing one of these would otherwise get a
 * plausible-looking answer to a different question.
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
  "event_readiness",
  "cluster_certainty",
  "quad_class",
  "as_of",
] as const;

/**
 * `summarize_events` - aggregate counts and metric statistics over Events.
 *
 * Backing endpoint: `GET /api/v2/events/summary`. Coverage begins 2026-03-01.
 *
 * ## Not a summarised search
 *
 * It aggregates the same Events `/api/v2/events` returns, but returns one
 * bucket per group instead of one row per event, and **no ids at all**. Use
 * `fetchSearchEvents` for records, this for volume and trend.
 *
 * ## `limit` works — except for `group_by: date`
 *
 * Measured, not assumed. `limit` caps **buckets** (default 50, max 500):
 *
 * ```
 * group_by=country  limit 1 -> 1    limit 10 -> 10    limit 50 -> 50
 * group_by=date     limit 5 -> 29   limit 10 -> 29   limit 50 -> 29
 * ```
 *
 * `group_by: date` returns every day in the window regardless of `limit`, so
 * the window length is what bounds that case. This is worth knowing because it
 * is the one grouping where a small `limit` has no effect.
 *
 * ## No cursor
 *
 * There is no cursor here - a result at the limit may be truncated. Widen
 * `limit` or narrow the window.
 *
 * ## No semantic search
 *
 * `search` is rejected. To find events by meaning, use `fetchSearchEvents`,
 * then re-run this with the structured filters you now know.
 */
export const fetchSummarizeEvents = async (
  input: SummarizeEventsInput = {},
  signal?: AbortSignal,
): Promise<RawGdeltResult> => {
  if (input.days !== undefined && (input.days < 1 || input.days > 30)) {
    throw new Error("days must be between 1 and 30 for summarize_events.");
  }

  const rejected = REJECTED_PARAMS.filter((key) => key in input);
  if (rejected.length > 0) {
    throw new Error(
      `summarize_events does not accept: ${rejected.join(", ")}. ` +
        `Use fetchSearchEvents for search/sort/cursor, or narrow the window.`,
    );
  }

  return callGdeltTool("summarize_events", withDefaultLimit(input), signal);
};