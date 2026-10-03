import { callGdeltTool } from "../gdeltClient.js";
import type { GetEventInput } from "../gdelt.types.js";

/**
 * `get_event` - fetch one known Event by id.
 *
 * Backing endpoint: `GET /api/v2/events/{id}`.
 *
 * **Requires an id**, which only exists after `fetchSearchEvents`. Read `id`
 * off the first card of a search result:
 *
 * ```ts
 * const search = await fetchSearchEvents({ days: 3 });
 * const event = await fetchGetEvent({ event_id: readFirstId(search) });
 * ```
 *
 * Returns `data` as a **single object**, not an array - the by-id tools behave
 * differently from the list tools.
 *
 * Upstream returns `data: null` for an unknown id, which is why this throws
 * rather than returning null: the caller passed something wrong.
 *
 * @see ../normalizers/getEvents.normalizer.ts
 */
export const fetchGetEvent = async (
  input: GetEventInput,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof callGdeltTool>>> => {
  if (!input.event_id) {
    throw new Error("event_id is required for get_event.");
  }

  return callGdeltTool("get_event", input, signal);
};