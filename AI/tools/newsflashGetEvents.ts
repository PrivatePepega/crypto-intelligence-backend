import { tool } from "ai";
import { z } from "zod";
import { callMcpTool } from "../../mcp/client.js";
import { normalizeNewsflashEvents, normalizeNewsflashEventsForAI } from "../../mcp/newsFlash/newsFlashNormalizer.js";

export const newsflashGetEventsTool = tool({
  description:
    "Newsflash clustered event search. Multiple articles about the same story collapse into one event.\n\n" +
    "Does: corroborated current-event discovery and source-count filtering.\n" +
    "Does not: expose individual articles or deep article text. Broad queries can be sparse.\n\n" +
    "Prefer min_sources 2 when you want corroboration; use the article search only when you need individual coverage.",
  inputSchema: z.object({
    q: z.string().optional().describe("Focused topic, entity, person, event, or concept."),
    semantic: z.boolean().optional().describe("Use semantic matching for a conceptual query."),
    category: z.enum(["crypto","tradfi","business","tech","politics","world","science","health","energy","sports"]).optional().describe("Optional Newsflash category."),
    min_sources: z.number().int().min(1).max(10).optional().describe("Minimum distinct sources. Use 2 for corroborated events."),
    limit: z.number().int().min(1).max(25).default(15).describe("Maximum clustered events."),
  }),
  execute: async (input, options) => {
    const result = await callMcpTool("newsflash_get_events", input, options.abortSignal);
    return normalizeNewsflashEventsForAI(normalizeNewsflashEvents(result));
  },
});
