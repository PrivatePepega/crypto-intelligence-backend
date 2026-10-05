import { tool } from "ai";
import { z } from "zod";
import { callMcpTool } from "../../mcp/client.js";
import { normalizeCurrentsNews } from "../../mcp/composio/currentsApiNormalizer.js";

export const currentsSearchTool = tool({
    description:
        "Search Currents for recent news by keyword, category, country and date, returning title, description and category per article. " +
  "Good for breadth of ordinary daily news coverage - company announcements, product news, general current events - across a chosen category and country. " +
  "Do NOT use it for important market or financial news. It has no significance ranking, and a measured 'stock market earnings' query returned mostly corporate housekeeping: two insider-transaction reports ('SVP Paul Williams sold 3,000 shares', 'insider Patrick Coveney sold 91,027 shares'), both categorised 'regional'. A result set is a raw keyword match, so expect a low signal-to-noise ratio and read the descriptions rather than trusting relevance order. " +
  "For ranked or significant financial events use an events tool; for sourced reporting use a web search. " +
  "Keep keyword searches short and focused, and always request English.",
    inputSchema: z.object({
    category: z
      .string()
      .optional()
      .describe(
        "News category or comma-separated categories, such as 'business', 'technology', 'politics', 'finance', or 'technology,finance'. Use when the Observer's domain maps naturally to a Currents category.",
      ),

    country: z
      .string()
      .optional()
      .describe(
        "Two-letter country code such as 'US', 'GB', or 'CA'. Use when coverage from a particular country is relevant.",
      ),

    end_date: z
      .string()
      .optional()
      .describe(
        "End of the news search window in RFC3339 format. Currents allows a maximum 7-day date range. For the daily Observer, normally omit this and search current/recent news. Never create a date range longer than 7 days.",
    ),

    keywords: z
      .string()
      .optional()
      .describe(
        "Short focused keywords or phrases for the news search. Good examples: 'Bitcoin crypto', 'Federal Reserve rates', or 'Nvidia AI chips'. Avoid long natural-language questions.",
      ),

    language: z
      .literal("en")
      .default("en")
      .describe(
        "Language filter. Always use English ('en') for Observer news research.",
      ),

    page_number: z
      .number()
      .int()
      .min(1)
      .max(180)
      .default(1)
      .describe(
        "1-based result page. Start with page 1. Only request another page when additional distinct coverage is needed.",
      ),

    page_size: z
      .number()
      .int()
      .min(15)
      .max(30)
      .default(20)
      .describe(
        "Number of articles to return. Prefer 5-10 for Observer research so there is enough breadth without unnecessarily increasing context.",
      ),

    start_date: z
      .string()
      .optional()
      .describe(
        "Start of the news search window in RFC3339 format. Currents allows a maximum 7-day date range. For the daily Observer, prefer today's date or a recent window within the last 7 days. Never request dates more than 6 days before today.",
      ),
  }),

  execute: async (input, options) => {
    return await searchCurrentsNews(
      input,
      options.abortSignal,
    );
  },
});

/**
 * Calls the Currents news search through the backend MCP server.
 *
 * The Observer talks to our MCP server instead of calling Currents
 * or Composio directly. Our MCP server handles the provider routing.
 */
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