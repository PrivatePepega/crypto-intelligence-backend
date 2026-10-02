import type { Client } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const getEventsInputSchema = z.object({
  q: z.string().optional(),

  semantic: z.boolean().optional(),

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

  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional(),

  min_sources: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional(),
});

export class GetEventsTool {
  constructor(
    private readonly getClient: () => Promise<Client>,
  ) {}

  public register(server: McpServer): void {
    server.registerTool(
      "newsflash_get_events",
      {
        title: "Get Newsflash events",

        description:
          "Query Newsflash's deduplicated news event graph. Prefer this for current events, headlines, briefings, and topic research because multiple articles about the same happening are collapsed into one event. Use min_sources of 2 or 3 when looking for corroborated signals.",

        inputSchema: getEventsInputSchema,

        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },

      async (input) => {
        const client = await this.getClient();

        return await client.callTool({
          name: "get_events",
          arguments: input,
        });
      },
    );
  }
}