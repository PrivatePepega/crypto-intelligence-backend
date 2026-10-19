import { z } from "zod";

// What the node gives to the agent.
export const macroMarketRegimeInputSchema = z.object({
  previousBrief: z.string().nullable(),

  deterministicContext: z.string().nullable(),

  observations: z.array(
    z.object({
      id: z.string(),
      domain: z.string(),
      summary: z.string(),
    }),
  ),
});

// What the agent must return.
export const macroMarketRegimeOutputSchema = z.object({
  updateRecommended: z.boolean(),

  proposedBrief: z.string().nullable(),

  keyChanges: z.array(z.string()),

  evidenceIds: z.array(z.string()),

  summary: z.string(),
});

export type MacroMarketRegimeInput = z.infer<
  typeof macroMarketRegimeInputSchema
>;

export type MacroMarketRegimeOutput = z.infer<
  typeof macroMarketRegimeOutputSchema
>;

// Shared state passed between LangGraph nodes.
export const macroMarketRegimeStateSchema =
  macroMarketRegimeInputSchema.extend({
    analysis: macroMarketRegimeOutputSchema.optional(),
  });

export type MacroMarketRegimeState = z.infer<
  typeof macroMarketRegimeStateSchema
>;
























import { generateText, Output } from "ai";

import { models } from "../providers/model.js";

import {
  macroMarketRegimeInputSchema,
  macroMarketRegimeOutputSchema,
  type MacroMarketRegimeInput,
} from "../schemas/macroMarketRegime.schema.js";

const modelPick = models.openrouterFree;

const systemPrompt = `
You are the Macro & Market Regime analyst in a Climate intelligence system.

Your responsibility is to evaluate whether new intelligence meaningfully
changes the existing Macro & Market Regime brief.

Consider:
- Broad market direction and risk appetite
- Inflation, interest rates, liquidity, and monetary policy
- Economic growth and recession risks
- Cross-market relationships and major macroeconomic developments
- Whether new observations change the existing interpretation

Rules:
- Use the supplied observations and deterministic context as evidence.
- Do not invent facts or evidence.
- Do not recommend an update merely because new information exists.
- Preserve the previous brief's valid conclusions unless evidence changes them.
- If an update is unnecessary, set updateRecommended to false and
  proposedBrief to null.
- Include the IDs of observations supporting your conclusions.
`;

export async function runMacroMarketRegimeAgent(
  input: MacroMarketRegimeInput,
) {
  const validatedInput =
    macroMarketRegimeInputSchema.parse(input);

  const result = await generateText({
    model: modelPick,
    instructions: systemPrompt,
    prompt: JSON.stringify(validatedInput),
    maxOutputTokens: 3000,

    output: Output.object({
      schema: macroMarketRegimeOutputSchema,
      name: "macro_market_regime_analysis",
      description:
        "Assessment of whether new evidence warrants updating the Macro & Market Regime brief.",
    }),
  });

  return result.output;
}





























import {
    runMacroMarketRegimeAgent,
  } from "../agents/macroMarketRegime.agent.js";
  
  import type {
    MacroMarketRegimeState,
  } from "../schemas/macroMarketRegime.schema.js";
  
  export async function macroMarketRegimeNode(
    state: MacroMarketRegimeState,
  ) {
    const analysis = await runMacroMarketRegimeAgent({
      previousBrief: state.previousBrief,
      deterministicContext: state.deterministicContext,
      observations: state.observations,
    });
  
    return {
      analysis,
    };
  }























  import {
    StateGraph,
    START,
    END,
  } from "@langchain/langgraph";
  
  import {
    macroMarketRegimeStateSchema,
  } from "../schemas/macroMarketRegime.schema.js";
  
  import {
    macroMarketRegimeNode,
  } from "../nodes/macroMarketRegime.node.js";
  
  export function createMacroMarketRegimeGraph() {
    const graph = new StateGraph(macroMarketRegimeStateSchema)
      .addNode("macroMarketRegime", macroMarketRegimeNode)
      .addEdge(START, "macroMarketRegime")
      .addEdge("macroMarketRegime", END);
  
    return graph.compile();
  }






























  import {
    createMacroMarketRegimeGraph,
  } from "./graphs/macroMarketRegime.graph.js";
  
  const graph = createMacroMarketRegimeGraph();
  
  const result = await graph.invoke({
    previousBrief: "Markets remain sensitive to interest-rate expectations.",
    deterministicContext: "Inflation remains elevated; rate policy is restrictive.",
    observations: [
      {
        id: "obs-001",
        domain: "macro",
        summary: "New inflation data came in above expectations.",
      },
    ],
  });
  
  console.log(result.analysis);
