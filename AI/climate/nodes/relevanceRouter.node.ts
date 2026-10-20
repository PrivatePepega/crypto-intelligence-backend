import pool from "../../../config/database.js";
import {
    runRelevanceRouterAgent,
  } from "../agents/relevanceRouter.agent.js";
  
  import type {
      Observation,
      RelevanceRouterDispatchState,
    RelevanceRouterInput,
    RelevanceRouterNodeInput,
    ResearchedObservation,
  } from "../schemas/relevanceRouter.schema.js";
  
  import { END, Send } from "@langchain/langgraph";

//   import type { RelevanceRouterState } from "../schemas/relevanceRouter.schema.js";

  import {macroMarketRegimeAgentBrief} from "../prompts/section relevance router instructions/02 — Macro & Market Regime.js"
import { sectorConditionsRouterBrief } from "../prompts/section relevance router instructions/03 — Sector Conditions.js";
import { importantStoriesNarrativesRouterBrief } from "../prompts/section relevance router instructions/04 — Important Stories & Narratives.js";
import { trendsCapitalDirectionRouterBrief } from "../prompts/section relevance router instructions/05 — Trends & Capital Direction.js";
import { outlookRisksUncertaintiesRouterBrief } from "../prompts/section relevance router instructions/06 — Outlook, Risks & Uncertainties.js";





export async function relevanceRouterNode(
  state: RelevanceRouterNodeInput,
) {
  const result = await runRelevanceRouterAgent(state.job);

  return {
    results: [
      {
        section: state.job.section,
        domain: state.job.domain,
        result,
      },
    ],
  };
}






  export function relevanceRouterDispatch(
    state: RelevanceRouterDispatchState,
  ) {
    if (state.jobs.length === 0) {
      return END;
    }
  
    return state.jobs.map(
      (job) => new Send("relevanceRouter", { job }),
    );
  }











  const sections = [
    {
        name: "Macro & Market Regime",
        instructions: macroMarketRegimeAgentBrief,
    },
    {
        name: "Sector Conditions",
        instructions: sectorConditionsRouterBrief,
    },
    {
        name: "Important Stories & Narratives",
        instructions: importantStoriesNarrativesRouterBrief,
    },
    {
        name: "Trends & Capital Direction",
        instructions: trendsCapitalDirectionRouterBrief,
    },
    {
        name: "Outlook, Risks & Uncertainties",
        instructions: outlookRisksUncertaintiesRouterBrief,
    },
  ]

  const domains = [
    "geopolitics",
    "financial_markets",
    "macro",
    "commodities_energy",
    "crypto",
    "ai_technology_industry",
  ] as const;
  
  type LoadJobsState = {
    intelligenceSetId: string;
  };
  
  type ObservationRow = Observation;
  
  type ResearchRow = ResearchedObservation;
  
  export async function relevanceRouterLoadJobsNode(
    state: LoadJobsState,
  ) {
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
  
    // Separate observations that already have research.
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
  
    const jobs: RelevanceRouterInput[] = [];
  
    for (const section of sections) {
      for (const domain of domains) {
        jobs.push({
          section: section.name,
          sectionInstructions: section.instructions,
          domain,
          observations,
          researchedObservations,
        });
      }
    }
  
    return { jobs };
  }

