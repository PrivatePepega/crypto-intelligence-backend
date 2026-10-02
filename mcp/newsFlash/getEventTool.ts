import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { Client } from "@modelcontextprotocol/client";

const getEventInputSchema = z.object({
  id: z.number().int(),
});

export class GetEventTool {
  constructor(private readonly client: Client) {}

  public register(server: McpServer): void {
    server.registerTool(
      "newsflash_get_event",
      {
        title: "Get Newsflash event",
        description:
          "Fetch a single Newsflash event by ID, including all corroborating articles. Use this only when deeper outlet-level detail is needed for a specific event.",
        inputSchema: getEventInputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (input) => {
        const result = await this.client.callTool({
          name: "get_event",
          arguments: input,
        });

        return result;
      },
    );
  }
}