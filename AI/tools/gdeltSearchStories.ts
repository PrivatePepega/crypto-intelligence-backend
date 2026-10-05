import { tool } from "ai";
import { z } from "zod";

import {
  normalizeGdeltStories,
  type RawGdeltStory,
} from "../../mcp/GDELT/normalizers/getSearchStories.normalizer.js";

import {
  GDELT_TOPIC_MAP,
  gdeltAgentTopics,
} from "../../mcp/GDELT/agent/gdeltTopicMap.js";

import { fetchSearchStories } from "../../mcp/GDELT/fetchers/searchStories.js";
import {
  assertNotError,
  readPayloadRecords,
} from "../../mcp/GDELT/gdeltClient.js";

export const gdeltSearchStoriesTool = tool({
  description:
    "Search GDELT for recent story headlines on a topic, returning a large batch with no accompanying text - each item is just an id, title, category, region and significance score. " +
    "Best for breadth: scanning how much attention a topic is getting and catching titles you did not think to search for. A finance query surfaced 20 titles including a $30 billion OpenAI investment and a Saudi sukuk offering. " +
    "Do NOT use this to understand an event. There is no summary and no article text, so anything beyond the headline itself is unavailable, and at 40-80 items per call there is a lot of surface area with no depth behind it - use the events tool when you need to know what actually happened. " +
    "The topic filter is broad and the categories overlap: topic=crypto returned 80 items that were mostly economic stories about central banks and bond markets rather than crypto. Always pass a query to narrow it, and treat the result as leads to follow up rather than as an answer. " +
    "For real web pages with source names use the web search tool.",

  inputSchema: z.object({
    topic: z
      .enum(gdeltAgentTopics)
      .describe(
        "Broad topic to scan. Note the mapping is loose: 'crypto' fans out across four story categories and a measured run returned 80 items that were mostly general economic stories about central banks and bond markets, not crypto. Always pair it with a query. 'finance' and 'technology' are the tighter mappings.",
      ),

    query: z
      .string()
      .optional()
      .describe(
        "Optional focused subject to search within the selected topic. Examples: 'Bitcoin ETF', 'Federal Reserve', 'OpenAI', or 'Russia Ukraine'. Keep the query short and focused.",
      ),

    days: z
      .number()
      .int()
      .min(1)
      .max(7)
      .default(1)
      .describe(
        "Number of recent days to search. Prefer 1 for today's developments. Use several days when recent context is useful.",
      ),
  }),

  execute: async (input, options) => {
    const topicConfig = GDELT_TOPIC_MAP[input.topic];

    const search = input.query
      ? `${topicConfig.search} ${input.query}`
      : topicConfig.search;

    // `story_category` takes a SINGLE value, and comma-separating it does not
    // work - verified live: `story_category="CONFLICT,POLITICAL"` returns an
    // empty result set, while `story_category="CONFLICT"` filters correctly.
    // Each topic maps to 2-4 story categories, so the topic's full coverage is
    // gathered by fanning out one request per category and merging.
    //
    // This is `story_category` rather than `categories`: the latter is the
    // EVENT category enum (Battles, Protests, ECONOMIC, ...), a different
    // vocabulary from the story categories this map holds (CONFLICT,
    // conflict_security, cameoplus_economic, ...).
    const responses = await Promise.all(
      topicConfig.storyCategories.map(async (storyCategory) => {
        const result = await fetchSearchStories(
          {
            search,
            days: input.days,
            story_category: storyCategory,
            search_mode: "semantic",
            sort: "significance",
          },
          options.abortSignal,
        );

        assertNotError(result);

        return readPayloadRecords<RawGdeltStory>(result);
      }),
    );

    // A Story can match more than one requested category, so dedupe on `id`.
    // First-seen order is kept, which preserves each category's significance
    // ranking.
    const byId = new Map<string, RawGdeltStory>();

    for (const stories of responses) {
      for (const story of stories) {
        if (typeof story.id === "string" && !byId.has(story.id)) {
          byId.set(story.id, story);
        }
      }
    }

    return normalizeGdeltStories([...byId.values()]);
  },
});