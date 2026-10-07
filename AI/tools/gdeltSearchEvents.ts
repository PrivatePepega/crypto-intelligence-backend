import { tool } from "ai";
import { z } from "zod";
import {
  normalizeGdeltEvents,
  type RawGdeltEvent,
} from "../../mcp/GDELT/normalizers/searchEvents.normalizer.js";
import { GDELT_TOPIC_MAP, gdeltAgentTopics } from "../../mcp/GDELT/agent/gdeltTopicMap.js";
import { fetchSearchEvents } from "../../mcp/GDELT/fetchers/searchEvents.js";
import { assertNotError, readPayloadRecords } from "../../mcp/GDELT/gdeltClient.js";

export const gdeltSearchEventsTool = tool({
  description:
    "Searches GDELT's structured event data and returns compact events with summary, date evidence, region, source domain, and significance.\n\n" +
    "Does: identify meaningful real-world events and rank them by GDELT significance. Strong for geopolitics and major global developments.\n" +
    "Does not: provide article bodies or guarantee precise topic matching. The crypto topic is broad and can surface general economic stories, so pair crypto with a focused query.\n\n" +
    "Use as a high-signal event discovery tool; use stories for cheaper headline breadth.",
  inputSchema: z.object({
    topic: z
      .enum(gdeltAgentTopics)
      .describe(
        "Broad topic: geopolitics, finance, crypto, technology, energy, macro, or regulation.",
      ),
    query: z
      .string()
      .optional()
      .describe("Short focused subject, entity, or event. Especially important for crypto."),
    days: z
      .number()
      .int()
      .min(1)
      .max(7)
      .default(1)
      .describe("Recent-day window. Prefer 1 for the daily Observer."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe(
        "Maximum events to return. Upstream caps this at 100. Use a small number for a specific question, larger for a broad sweep.",
      ),
  }),
  execute: async (input, options) => {
    const topicConfig = GDELT_TOPIC_MAP[input.topic];
    const search = input.query ? `${topicConfig.search} ${input.query}` : topicConfig.search;
    const result = await fetchSearchEvents(
      {
        search,
        days: input.days,
        categories: topicConfig.eventCategories,
        search_mode: "semantic",
        sort: "significance",
        limit: input.limit,
      },
      options.abortSignal,
    );
    assertNotError(result);
    return normalizeGdeltEvents(readPayloadRecords<RawGdeltEvent>(result));
  },
});
