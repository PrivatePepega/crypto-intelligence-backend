import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { Client } from "@modelcontextprotocol/client";

const searchArticlesInputSchema = z.object({
  q: z.string().optional(),
  source: z.string().optional(),
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
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export class SearchArticlesTool {
  constructor(private readonly client: Client) {}

  public register(server: McpServer): void {
    server.registerTool(
      "newsflash_search_articles",
      {
        title: "Search Newsflash articles",
        description:
          "Search Newsflash's underlying raw news articles. Use this when per-outlet coverage or individual articles are needed rather than deduplicated events.",
        inputSchema: searchArticlesInputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (input) => {
        const result = await this.client.callTool({
          name: "search_articles",
          arguments: input,
        });

        return result;
      },
    );
  }
}