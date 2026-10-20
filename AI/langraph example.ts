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
    Annotation,
    END,
    Send,
    START,
    StateGraph,
  } from "@langchain/langgraph";
  
  import pool from "../../../config/database.js";
  
  import {
    runRelevanceRouterAgent,
  } from "../agents/relevanceRouter.agent.js";
  
  import type {
    RelevanceRouterInput,
    RelevanceRouterOutput,
  } from "../schemas/relevanceRouter.schema.js";
  
  // Replace these example configurations with your actual instructions.
  const sections = [
    {
      name: "Macro & Market Regime",
      instructions: "Insert the complete section instructions.",
    },
    {
      name: "Sector Conditions",
      instructions: "Insert the complete section instructions.",
    },
  ];
  
  const domains = [
    {
      name: "Crypto",
      instructions: "Insert the complete domain instructions.",
    },
    {
      name: "Geopolitics",
      instructions: "Insert the complete domain instructions.",
    },
  ];
  
  type ObservationRow = {
    id: string;
    observation: string;
    market_domain: string;
    type: string;
  };
  
  type ResearchRow = {
    id: string;
    observation_id: string;
    observation: string;
    research: string;
    market_domain: string;
    type: string;
  };
  
  type RouterJob = RelevanceRouterInput;
  
  type RouterResult = {
    section: string;
    domain: string;
    output: RelevanceRouterOutput;
  };
  
  // Graph state shared by the parent graph.
  // Each Send invocation receives its own job payload.
  const GraphState = Annotation.Root({
    intelligenceSetId: Annotation<string>(),
  
    jobs: Annotation<RouterJob[]>({
      default: () => [],
    }),
  
    job: Annotation<RouterJob | null>({
      default: () => null,
    }),
  
    results: Annotation<RouterResult[]>({
      reducer: (current, update) => current.concat(update),
      default: () => [],
    }),
  });
  
  type State = typeof GraphState.State;
  
  // 1. Load database records and prepare every section/domain job.
  async function loadJobs(state: State) {
    const observationsResult = await pool.query<ObservationRow>(
      `
        SELECT id, observation, market_domain, type
        FROM weather.observations
        WHERE intelligence_set_id = $1
        ORDER BY created_at ASC
      `,
      [state.intelligenceSetId],
    );
  
    const researchResult = await pool.query<ResearchRow>(
      `
        SELECT
          id,
          observation_id,
          observation,
          research,
          market_domain,
          type
        FROM weather.research
        WHERE intelligence_set_id = $1
        ORDER BY created_at ASC
      `,
      [state.intelligenceSetId],
    );
  
    const researchRows = researchResult.rows;
  
    // Observations that already have research are excluded
    // from the unresearched observations array.
    const researchedIds = new Set(
      researchRows.map((item) => item.observation_id),
    );
  
    const observations = observationsResult.rows.filter(
      (item) => !researchedIds.has(item.id),
    );
  
    const researchedObservations = researchRows.map((item) => ({
      id: item.id,
      observation_id: item.observation_id,
      observation: item.observation,
      research: item.research,
      market_domain: item.market_domain,
      type: item.type,
    }));
  
    const jobs: RouterJob[] = [];
  
    for (const section of sections) {
      for (const domain of domains) {
        jobs.push({
          section: section.name,
          sectionInstructions: section.instructions,
          domain: domain.name,
          domainInstructions: domain.instructions,
          observations,
          researchedObservations,
        });
      }
    }
  
    return { jobs };
  }
  
  // 2. Dynamically dispatch one invocation per job.
  function dispatchJobs(state: State) {
    if (state.jobs.length === 0) {
      return END;
    }
  
    return state.jobs.map(
      (job) => new Send("runRouter", { job }),
    );
  }
  
  // 3. Execute the same agent with the job supplied by Send.
  async function runRouter(
    state: State,
  ) {
    if (!state.job) {
      throw new Error("Missing relevance router job.");
    }
  
    const output = await runRelevanceRouterAgent(state.job);
  
    return {
      results: [
        {
          section: state.job.section,
          domain: state.job.domain,
          output,
        },
      ],
    };
  }
  
  // 4. Assemble the graph.
  export function createRelevanceRouterGraph() {
    return new StateGraph(GraphState)
      .addNode("loadJobs", loadJobs)
      .addNode("runRouter", runRouter)
      .addEdge(START, "loadJobs")
      .addConditionalEdges("loadJobs", dispatchJobs)
      .addEdge("runRouter", END)
      .compile();
  }


  import {
    createRelevanceRouterGraph,
  } from "./graphs/relevanceRouter.graph.js";
  
  const graph = createRelevanceRouterGraph();
  
  const result = await graph.invoke({
    intelligenceSetId: "YOUR-DAILY-SET-UUID",
  });
  
  console.log(result.results);