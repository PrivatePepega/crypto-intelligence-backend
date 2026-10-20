import { generateText, Output } from "ai";

import { models } from "../../providers/model.js";

import {
  relevanceRouterInputSchema,
  relevanceRouterOutputSchema,
  type RelevanceRouterInput,
} from "../schemas/relevanceRouter.schema.js";
import { relevanceRouterSystemPrompt } from "../prompts/relevance router/relevanceRouter.prompt.js";


const modelPick = models.openrouterFree;


function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export async function runRelevanceRouterAgent(
  input: RelevanceRouterInput,
) {
  const validatedInput =
    relevanceRouterInputSchema.parse(input);

      // Wait 4 seconds before making the LLM request
  await delay(4000);


  const result = await generateText({
    model: modelPick,
    instructions: relevanceRouterSystemPrompt,
    prompt: JSON.stringify(validatedInput),
    maxOutputTokens: 15_000,

    output: Output.object({
      schema: relevanceRouterOutputSchema,
      name: "relevance_router_analysis",
      description:
        "Identifies observations relevant to a specific Climate section and domain, explaining why each observation is relevant.",
    }),
  });

  return result.output;
}