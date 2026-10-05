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
    "Search GDELT for recent event intelligence on a topic. This is the strongest research tool here for geopolitics and global financial events: each event comes back with a written summary explaining what happened, dated evidence for when, the source domain, the region it applies to, and a significance score from 0 to 1. A finance query returned events like a $30 billion investment into OpenAI and a Saudi sovereign bond offering, each detailed enough to understand without opening a source. " +
    "Use topic for broad monitoring and query to narrow within it. Prefer this over a web search when you want to know WHAT HAPPENED rather than to find pages. " +
    "Two limits worth knowing: the topic filter is broad, so topic=crypto still returns many general economic stories - pass a query when you need precision; and event coverage follows GDELT's global English-language sources, so some countries and local outlets are thin. " +
    "For headline-only breadth use the stories tool; for actual web pages with source names use the web search tool.",

  inputSchema: z.object({
    topic: z
      .enum(gdeltAgentTopics)
      .describe(
        "Broad intelligence topic: geopolitics, finance, crypto, technology, energy, macro, or regulation. The mapping is loosest for 'crypto', which also spans general economic stories - pair it with a query when precision matters.",
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