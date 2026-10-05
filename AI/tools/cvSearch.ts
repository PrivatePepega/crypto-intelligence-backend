import { tool } from "ai";
import { z } from "zod";

import { searchNews } from "../../mcp/cryptocurrency.cv/fetchers/search.js";

/** Results requested when the caller does not specify. */
const DEFAULT_LIMIT = 20;

export const cvSearchTool = tool({
  description:
    "Keyword and boolean search over cryptocurrency.cv headlines, supporting AND, OR, NOT and parentheses.\n\n" +
    "Best for:\n" +
    "- a specific coin, company, protocol or event\n" +
    "- boolean narrowing such as 'bitcoin AND (etf OR approval)'\n" +
    "\n" +
    "Limitations:\n" +
    "- free tier returns <=3 results regardless of limit\n" +
    "- volume varies sharply by term - 3 for 'stock market', 10 for 'artificial intelligence'\n" +
    "- crypto-only index\n" +
    "- no working date filter",

  inputSchema: z.object({
    q: z
      .string()
      .describe(
        "Search query. Supports AND, OR, NOT and parentheses, e.g. \"bitcoin AND (etf OR approval)\".",
      ),

    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_LIMIT)
      .describe(
        "Maximum results to return. The free tier caps responses at 3 regardless.",
      ),
  }),

  execute: async (input, options) => {
    return await searchNews(input.q, {
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});