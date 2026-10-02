import { tool } from "ai";
import { z } from "zod";

import { callMcpTool } from "../../mcp/client.js";
import {
  normalizeNewsflashEvents,
  normalizeNewsflashEventsForAI,
} from "../../mcp/newsFlash/newsFlashNormalizer.js";

export const newsflashGetEventsTool = tool({
  description:
    "Search Newsflash for current deduplicated news events. Use this as the primary Newsflash tool when researching what is happening around a topic, company, market, technology, political issue, or other current event. Newsflash groups multiple articles about the same event together. Keep the query focused on the topic or event you are researching.",

  inputSchema: z.object({
    q: z
      .string()
      .optional()
      .describe(
        "Topic, keyword, company, person, event, or concept to search for.",
      ),

    semantic: z
      .boolean()
      .optional()
      .describe(
        "Use semantic matching when researching a concept rather than an exact keyword. Requires a query.",
      ),

    source: z
      .string()
      .optional()
      .describe(
        "Optional Newsflash source slug, such as coindesk.",
      ),

    category: z
      .enum([
        "crypto",
        "tradfi",
        "business",
        "tech",
        "politics",
        "world",
        "science",
        "health",
        "energy",
        "sports",
      ])
      .optional()
      .describe("Optional Newsflash news category."),

    from: z
      .string()
      .optional()
      .describe(
        "Optional ISO 8601 start date/time for the event search.",
      ),

    to: z
      .string()
      .optional()
      .describe(
        "Optional ISO 8601 end date/time for the event search.",
      ),

    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of events to return."),

    min_sources: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe(
        "Only return events corroborated by at least this many distinct sources. Use 2 or 3 when looking for corroborated signals.",
      ),
  }),

  execute: async (input, options) => {
    const result = await callMcpTool(
      "newsflash_get_events",
      input,
      options.abortSignal,
    );

    const normalized = normalizeNewsflashEvents(result);

    return normalizeNewsflashEventsForAI(normalized);
  },
});