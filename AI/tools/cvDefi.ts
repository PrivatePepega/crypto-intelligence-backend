// import { tool } from "ai";
// import { z } from "zod";

// import { getDefiNews } from "../../mcp/cryptocurrency.cv/fetchers/defi.js";

// /** Articles requested when the caller does not specify. */
// const DEFAULT_LIMIT = 10;

// export const cvDefiTool = tool({
//   description:
//     "Get DeFi-specific news headlines and summaries from cryptocurrency.cv, each with a title and a description, newest first. Use this for decentralised-finance coverage such as lending, DEXs, stablecoins and on-chain governance. Some results are promotional rather than protocol news, so weigh them critically.",

//   inputSchema: z.object({
//     limit: z
//       .number()
//       .int()
//       .min(1)
//       .max(100)
//       .default(DEFAULT_LIMIT)
//       .describe(
//         "Maximum articles to return. The free tier caps responses at 3 regardless.",
//       ),
//   }),

//   execute: async (input, options) => {
//     return await getDefiNews({
//       limit: input.limit,
//       signal: options.abortSignal,
//     });
//   },
// });