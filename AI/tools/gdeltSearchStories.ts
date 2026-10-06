import { tool } from "ai";
import { z } from "zod";
import { normalizeGdeltStories, type RawGdeltStory } from "../../mcp/GDELT/normalizers/getSearchStories.normalizer.js";
import { GDELT_TOPIC_MAP, gdeltAgentTopics } from "../../mcp/GDELT/agent/gdeltTopicMap.js";
import { fetchSearchStories } from "../../mcp/GDELT/fetchers/searchStories.js";
import { assertNotError, readPayloadRecords } from "../../mcp/GDELT/gdeltClient.js";

export const gdeltSearchStoriesTool = tool({
  description:
    "Searches GDELT story clusters and returns compact headline-level results with category, region, and significance.\n\n" +
    "Does: broad discovery and attention scanning across global coverage.\n" +
    "Does not: explain events; there is no summary or article body. Results can be numerous and duplicate across categories. Crypto matching is broad and should always use a focused query.\n\n" +
    "Use before deeper research when you need headline breadth; use GDELT events when you need event context.",
  inputSchema: z.object({
    topic: z.enum(gdeltAgentTopics).describe(
      "Broad topic: geopolitics, finance, crypto, technology, energy, macro, or regulation.",
    ),
    query: z.string().optional().describe(
      "Short focused subject. Always provide one for crypto.",
    ),
    days: z.number().int().min(1).max(7).default(1).describe(
      "Recent-day window. Prefer 1 for the daily Observer.",
    ),
  }),
  execute: async (input, options) => {
    const topicConfig = GDELT_TOPIC_MAP[input.topic];
    const search = input.query ? `${topicConfig.search} ${input.query}` : topicConfig.search;
    const responses = await Promise.all(
      topicConfig.storyCategories.map(async (storyCategory) => {
        const result = await fetchSearchStories(
          { search, days: input.days, story_category: storyCategory, search_mode: "semantic", sort: "significance" },
          options.abortSignal,
        );
        assertNotError(result);
        return readPayloadRecords<RawGdeltStory>(result);
      }),
    );
    const byId = new Map();
    for (const stories of responses) {
      for (const story of stories) {
        if (typeof story.id === "string" && !byId.has(story.id)) byId.set(story.id, story);
      }
    }
    return normalizeGdeltStories([...byId.values()]);
  },
});
