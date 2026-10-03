import { callGdeltTool, withDefaultLimit } from "../gdeltClient.js";
import type { SearchStoriesInput } from "../gdelt.types.js";

/**
 * `search_stories` - clustered narrative coverage.
 *
 * Backing endpoint: `GET /api/v2/stories`. Continuous stories coverage begins
 * 2026-03-08. Returns 27-field Story records with linked Events, linked
 * Entities, metrics, public URL, normalized geo and top articles.
 *
 * **No id required.** This is the discovery surface for the story tools: run
 * it, read `id` off a record, and feed that to `fetchGetStory` and
 * `fetchGetStoryArticles`.
 *
 * `limit` defaults to 1 (see `DEFAULT_RECORD_LIMIT`); pass it explicitly for
 * volume. `search` defaults to `search_mode: "semantic"` upstream, which costs
 * an embedding call and can fail with 503 SEMANTIC_SEARCH_UNAVAILABLE - pass
 * `search_mode: "lexical"` to avoid it.
 *
 * Note `has_events`, `has_fatalities` and `has_civilian_targeting` are Story
 * aggregates over the Events it links, not per-story observations.
 *
 * @see ../normalizers/getSearchStories.normalizer.ts
 */
export const fetchSearchStories = async (
  input: SearchStoriesInput = {},
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof callGdeltTool>>> =>
  callGdeltTool("search_stories", withDefaultLimit(input), signal);