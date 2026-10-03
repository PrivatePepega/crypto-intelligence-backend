import { callGdeltTool, withDefaultLimit } from "../gdeltClient.js";
import type { GetEventInput, SearchEventsInput } from "../gdelt.types.js";

/**
 * search_events - the flagship: structured machine-coded Event cards.
 *
 * 49 input parameters; returns `{ success, data, applied_filters, pagination,
 * sort }`. Raw result on purpose, see `RawGdeltResult`.
 *
 * `limit` defaults to 1 so a captured fixture shows the record shape rather
 * than burying it. Pass `limit` explicitly for volume.
 *
 * Note: `search` defaults to semantic mode upstream, which costs an embedding
 * call and can fail with 503 SEMANTIC_SEARCH_UNAVAILABLE. Pass
 * `search_mode: "lexical"` when that matters.
 */
export const fetchSearchEvents = async (
  input: SearchEventsInput = {},
  signal?: AbortSignal,
) => callGdeltTool("search_events", withDefaultLimit(input), signal);

/**
 * get_event - one Event by id.
 *
 * `event_id` is required upstream. Returns a single record as an object, not
 * an array: the by-id tools behave differently from the list tools.
 */
export const fetchGetEvent = async (input: GetEventInput, signal?: AbortSignal) => {
  if (!input.event_id) {
    throw new Error("event_id is required.");
  }

  return callGdeltTool("get_event", input, signal);
};