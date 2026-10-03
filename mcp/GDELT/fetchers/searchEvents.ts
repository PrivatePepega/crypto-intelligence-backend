import { callGdeltTool, withDefaultLimit } from "../gdeltClient.js";
import type { SearchEventsInput } from "../gdelt.types.js";

/**
 * `search_events` - the flagship: structured machine-coded Event cards.
 *
 * Backing endpoint: `GET /api/v2/events`. Returns 44-field cards carrying
 * actors, geography, metrics, linked Stories and source articles.
 *
 * **No id required.** This is the discovery surface: run it, read `id` off a
 * card, and feed that to `fetchGetEvent` for the full record.
 *
 * `limit` defaults to 1 (see `DEFAULT_RECORD_LIMIT`); pass it explicitly for
 * volume. `search` defaults to `search_mode: "semantic"` upstream, which costs
 * an embedding call and can fail with 503 SEMANTIC_SEARCH_UNAVAILABLE - pass
 * `search_mode: "lexical"` to avoid it.
 *
 * **Rejected filters** (upstream returns 400, so these fail loudly):
 * `fatalities_min`/`_max`, `geo_scope`, `scope`, `detail`, `event_readiness`,
 * `cluster_certainty`, `quad_class`, `as_of`. Gate lethality with
 * `has_fatalities: true` and threshold the returned `fatalities` field.
 *
 * @see ../normalizers/searchEvents.normalizer.ts
 */
export const fetchSearchEvents = async (
  input: SearchEventsInput = {},
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof callGdeltTool>>> =>
  callGdeltTool("search_events", withDefaultLimit(input), signal);