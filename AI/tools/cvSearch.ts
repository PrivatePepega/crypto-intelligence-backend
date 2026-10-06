import { tool } from "ai";
import { z } from "zod";
import { searchNews } from "../../mcp/cryptocurrency.cv/fetchers/search.js";

const DEFAULT_LIMIT = 20;

export const cvSearchTool = tool({
  description:
    "Searches the cryptocurrency.cv index for a specific crypto subject using AND, OR, NOT, and parentheses.\n\n" +
    "Does: targeted lookup of coins, companies, protocols, or events.\n" +
    "Does not: provide general market coverage, reliable date filtering, or high volume. The free tier returns at most 3 results.\n\n" +
    "Use after an observation identifies a specific crypto subject.",
  inputSchema: z.object({
    q: z.string().describe(
      'Focused Boolean query, such as "bitcoin AND (etf OR approval)".',
    ),
    limit: z.number().int().min(1).max(30).default(DEFAULT_LIMIT).describe(
      "Maximum results.",
    ),
  }),
  execute: async (input, options) => {
    return await searchNews(input.q, {
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});
