import { tool } from "ai";
import { z } from "zod";

import { searchNews } from "../../mcp/cryptocurrency.cv/fetchers/search.js";

/** Results requested when the caller does not specify. */
const DEFAULT_LIMIT = 20;

export const cvSearchTool = tool({
  description:
    "Search crypto news on cryptocurrency.cv by keyword or boolean expression, returning headlines and descriptions." +
    "Use this when you have a specific subject - a coin, company, protocol or event - rather than wanting general coverage." +
    "Supports AND, OR, NOT and parentheses, so 'bitcoin AND (etf OR approval)' works." +
    "Result volume varies enormously with the term and is not something the limit controls: measured 9 results for 'Bitcoin', 10 for 'artificial intelligence' and only 3 for 'stock market', because this is a crypto-only index." +
    "If a query returns very little, the term is simply rare in crypto coverage rather than the tool failing - try a broader or differently-spelled term." +
    "There is no working date filter, so results cannot be restricted to a date range." +
    "For the freshest items use the breaking tool instead.",

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