import { tool } from "ai";
import { z } from "zod";
import { callMcpTool } from "../../mcp/client.js";
import { normalizeNewsflashArticles, normalizeNewsflashArticlesForAI } from "../../mcp/newsFlash/newsFlashNormalizer.js";

export const newsflashSearchArticlesTool = tool({
  description:
    "Newsflash article search returning compact titles and summaries.\n\n" +
    "Does: inspect individual reporting and compare how outlets frame a known story.\n" +
    "Does not: deduplicate coverage or provide article bodies. The same event can appear many times.\n\n" +
    "Use only after an event or observation needs individual-source follow-up.",
  inputSchema: z.object({
    q: z.string().optional().describe("Focused topic, entity, person, event, or concept."),
    source: z.string().optional().describe("Optional Newsflash source slug."),
    category: z.enum(["crypto","tradfi","business","tech","politics","world","science","health","energy","sports"]).optional().describe("Optional Newsflash category."),
    from: z.string().optional().describe("Optional ISO 8601 start time."),
    to: z.string().optional().describe("Optional ISO 8601 end time."),
    limit: z.number().int().min(1).max(25).default(15).describe("Maximum articles. Keep small for context efficiency."),
  }),
  execute: async (input, options) => {
    const result = await callMcpTool("newsflash_search_articles", input, options.abortSignal);
    return normalizeNewsflashArticlesForAI(normalizeNewsflashArticles(result));
  },
});
