import { tool } from "ai";
import { z } from "zod";
import { getNews } from "../../mcp/cryptocurrency.cv/fetchers/news.js";

const DEFAULT_LIMIT = 3;

export const cvNewsTool = tool({
  description:
    "General crypto news from cryptocurrency.cv.\n\n" +
    "Does: broad crypto discovery when a more specific feed is not enough.\n" +
    "Does not: reliably rank importance or provide broad high-quality coverage. The free tier returns at most 3 items; ticker noise and garbled titles can appear.\n\n" +
    "Prefer breaking, trending, or targeted crypto tools when applicable.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(30).default(DEFAULT_LIMIT).describe(
      "Maximum articles.",
    ),
  }),
  execute: async (input, options) => {
    return await getNews({ limit: input.limit, signal: options.abortSignal });
  },
});
