import { callGdeltTool } from "../gdeltClient.js";
import type { GetStoryInput } from "../gdelt.types.js";

/**
 * `get_story` - fetch one known Story by id.
 *
 * Backing endpoint: `GET /api/v2/stories/{id}`. Returns the Story with linked
 * Events, linked Entities, metrics, public URL, normalized geo and top 3 inline
 * articles.
 *
 * **Requires an id**, which only exists after `fetchSearchStories`:
 *
 * ```ts
 * const search = await fetchSearchStories({ days: 3 });
 * const story = await fetchGetStory({ story_id: readFirstId(search) });
 * ```
 *
 * Returns `data` as a **single object**, not an array.
 *
 * Upstream returns `data: null` for an unknown id, which is why this throws
 * rather than returning null.
 *
 * @see ../normalizers/getStory.normalizer.ts
 */
export const fetchGetStory = async (
  input: GetStoryInput,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof callGdeltTool>>> => {
  if (!input.story_id) {
    throw new Error("story_id is required for get_story.");
  }

  return callGdeltTool("get_story", input, signal);
};