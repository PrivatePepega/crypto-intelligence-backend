import { tool } from "ai";
import { z } from "zod";

import { searchNews } from "../../mcp/cryptocurrency.cv/fetchers/search.js";

/** Results requested when the caller does not specify. */
const DEFAULT_LIMIT = 20;

export const cvSearchTool = tool({
  description:
    "Search crypto news on cryptocurrency.cv by keyword, returning headlines and summaries, each with a title and a description. Use this for a specific subject, company, coin or event rather than broad coverage. Supports AND, OR, NOT and parentheses. Note there is no working date filter - results cannot be restricted to a date range.",

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