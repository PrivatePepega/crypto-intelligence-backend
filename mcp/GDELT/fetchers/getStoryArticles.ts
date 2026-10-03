import { callGdeltTool, withDefaultLimit } from "../gdeltClient.js";
import type { GetStoryArticlesInput } from "../gdelt.types.js";

/**
 * `get_story_articles` - the article evidence behind one Story.
 *
 * Backing endpoint: `GET /api/v2/stories/{id}/articles`. Canonical-URL
 * deduplicated, with source language and provenance-backed publisher country.
 * This is the tool that produces citable source documents.
 *
 * **Requires a story id**, which only exists after `fetchSearchStories` (or
 * from `get_story`). Unlike `get_story`, articles are returned as an **array**.
 *
 * `limit` defaults to 1 (see `DEFAULT_RECORD_LIMIT`); pass it explicitly for
 * volume - `{"story_id": "...", "limit": 20}`.
 *
 * ## `rank` and `role` explain why an article is here
 *
 * `role: "core"` marks the articles the Story was built from. Upstream's
 * reference is explicit that "core" is what makes an article core to a story
 * and that ranks derive from it.
 *
 * ## The `digest` block is wrong upstream - use `payload`
 *
 * For this tool only, `_gdelt.digest.data[0]` repeats the **parent Story's**
 * fields (`category`, `story_date`, `geo`, `fatalities`, `metrics`,
 * `linked_events`, `entity_refs`, `top_articles`) rather than the article's.
 * The article fields - `domain`, `article_date`, `rank`, `role`, `language`,
 * `publisher_country_iso3` - exist only under `_gdelt.payload.data`.
 *
 * @see ../normalizers/getStoryArticles.normalizer.ts
 */
export const fetchGetStoryArticles = async (
  input: GetStoryArticlesInput,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof callGdeltTool>>> => {
  if (!input.story_id) {
    throw new Error("story_id is required for get_story_articles.");
  }

  return callGdeltTool(
    "get_story_articles",
    withDefaultLimit(input),
    signal,
  );
};