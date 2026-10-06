import { tool } from "ai";
import { z } from "zod";
import { callMcpTool } from "../../mcp/client.js";
import { normalizeCurrentsNews } from "../../mcp/composio/currentsApiNormalizer.js";

export const currentsSearchTool = tool({
  description:
    "Searches Currents for recent general news and returns compact article titles, descriptions, and categories.\n\n" +
    "Does: broad discovery, country/category filtering, and finding ordinary current coverage.\n" +
    "Does not: rank importance, reliably distinguish breaking news, or provide deep article context. Expect corporate and low-signal stories mixed with important ones.\n\n" +
    "Use after higher-signal event/breaking tools when you need additional coverage or a different source.",
  inputSchema: z.object({
    category: z.string().optional().describe(
      "Optional Currents category or comma-separated categories, such as 'business', 'technology', 'politics', or 'finance'.",
    ),
    country: z.string().optional().describe(
      "Optional two-letter country code such as 'US', 'GB', or 'CA'.",
    ),
    end_date: z.string().optional().describe(
      "Optional RFC3339 end date. Currents allows a maximum 7-day range.",
    ),
    keywords: z.string().optional().describe(
      "Short focused keywords or phrases. Use subjects, entities, or events rather than a long question.",
    ),
    language: z.literal("en").default("en").describe(
      "Observer language. Keep this as English ('en').",
    ),
    page_number: z.number().int().min(1).max(180).default(1).describe(
      "Result page. Start at 1; only paginate when additional distinct coverage is needed.",
    ),
    page_size: z.number().int().min(15).max(30).default(15).describe(
      "Number of articles requested. Keep small for Observer context efficiency.",
    ),
    start_date: z.string().optional().describe(
      "Optional RFC3339 start date. Keep the window within Currents' 7-day maximum.",
    ),
  }),
  execute: async (input, options) => {
    return await searchCurrentsNews(input, options.abortSignal);
  },
});

type CurrentsMcpResponse = {
  news: Array<{
    category?: string[];
    description?: string;
    title?: string;
  }>;
  page?: number;
  status?: string;
};

export const searchCurrentsNews = async (
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => {
  const result = (await callMcpTool(
    "currents_search_news",
    input,
    signal,
  )) as CurrentsMcpResponse | null;

  if (!result) {
    return [];
  }

  return normalizeCurrentsNews(result.news);
};
