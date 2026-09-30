
import { tool } from "ai";
import { z } from "zod";
import { getCurrentIndicatorData, webSearchTool } from "./observer.utils.js";



// --------------------------------------------------
// Observer tools
// --------------------------------------------------

export const observerTools = {
  get_current_indicator: tool({
    description:
      "Find up to three relevant deterministic indicators for a natural-language request and return their current datasets together with metadata explaining what each indicator measures, how it is used, and why it is significant. Use this when current quantitative data is needed to understand a development or change.",

    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Describe the current quantitative information needed in natural language.",
        ),
    }),

    execute: async ({ query }) => {
      const toolResponse = await getCurrentIndicatorData(query);

      return toolResponse.result;
    },
  }),

  web_search: webSearchTool,
};