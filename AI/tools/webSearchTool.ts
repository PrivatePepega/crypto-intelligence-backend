import { tool } from "ai";
import { z } from "zod";
import { webSearch } from "../../utils/AI/webSearch.js";







    // --------------------------------------------------
  // Web search tool
  // --------------------------------------------------



  
  export const webSearchTool = tool({
    description:
      "Search the public web for recent information relevant to the Observer's domain. Use this to discover current events, announcements, regulatory developments, security incidents, market narratives, and other developments that may not be available through deterministic database indicators.",
  
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "A focused search query describing the information needed from the public web.",
        ),
    }),
  
    execute: async ({ query }) => {
      return await webSearch(query);
    },
  });

