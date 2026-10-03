import { tool } from "ai";
import { z } from "zod";

import {
  normalizeGdeltEvents,
  type RawGdeltEvent,
} from "../../mcp/GDELT/normalizers/searchEvents.normalizer.js";

import {
  GDELT_TOPIC_MAP,
  gdeltAgentTopics,
} from "../../mcp/GDELT/agent/gdeltTopicMap.js";

import { fetchSearchEvents } from "../../mcp/GDELT/fetchers/searchEvents.js";
import {
  assertNotError,
  readPayloadRecords,
} from "../../mcp/GDELT/gdeltClient.js";

export const gdeltSearchEventsTool = tool({
  description:
    "Search GDELT for broad recent event intelligence. Use this to discover multiple meaningful events related to a market or intelligence topic rather than searching for one exact event. Use topic for broad monitoring and query when a more specific subject is relevant.",

  inputSchema: z.object({
    topic: z
      .enum(gdeltAgentTopics)
      .describe(
        "Broad intelligence topic: crypto, finance, technology, geopolitics, energy, macro, or regulation.",
      ),

    query: z
      .string()
      .optional()
      .describe(
        "Optional focused subject to search within the selected topic. Keep the query short and focused.",
      ),

    days: z
      .number()
      .int()
      .min(1)
      .max(7)
      .default(1)
      .describe(
        "Number of recent days to search. Prefer 1 for today's developments.",
      ),
  }),

  execute: async (input, options) => {
    const topicConfig = GDELT_TOPIC_MAP[input.topic];

    const search = input.query
      ? `${topicConfig.search} ${input.query}`
      : topicConfig.search;

    const result = await fetchSearchEvents(
      {
        search,
        days: input.days,
        categories: topicConfig.eventCategories,
        search_mode: "semantic",
        sort: "significance",
      },
      options.abortSignal,
    );

    // A failed call must not look like "no events matched".
    assertNotError(result);

    // Records live at `_gdelt.payload.data` on the MCP result. Reading a
    // `response` key instead returns undefined on every call, so the tool
    // silently answered with an empty array.
    return normalizeGdeltEvents(readPayloadRecords<RawGdeltEvent>(result));
  },
});