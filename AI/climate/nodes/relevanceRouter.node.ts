import pool from "../../../config/database.js";
import { runRelevanceRouterAgent } from "../agents/relevanceRouter.agent.js";

import type {
  Observation,
  RelevanceRouterDispatchState,
  RelevanceRouterInput,
  RelevanceRouterNodeInput,
  ResearchedObservation,
} from "../schemas/relevanceRouter.schema.js";

import { END, Send } from "@langchain/langgraph";

import { macroMarketRegimeAgentBrief } from "../prompts/section relevance router instructions/02 — Macro & Market Regime.js";
import { sectorConditionsRouterBrief } from "../prompts/section relevance router instructions/03 — Sector Conditions.js";
import { importantStoriesNarrativesRouterBrief } from "../prompts/section relevance router instructions/04 — Important Stories & Narratives.js";
import { trendsCapitalDirectionRouterBrief } from "../prompts/section relevance router instructions/05 — Trends & Capital Direction.js";
import { outlookRisksUncertaintiesRouterBrief } from "../prompts/section relevance router instructions/06 — Outlook, Risks & Uncertainties.js";

import { injectRelevanceRouterOutput } from "../../utils/climate/databaseInjectors.js";

type LoadJobsState = {
  intelligenceSetId: string;
  climateIntelligenceSetId: string;
};

type ObservationRow = Observation;

type ResearchRow = ResearchedObservation;

export async function relevanceRouterNode(state: RelevanceRouterNodeInput) {
  const { section, domain } = state.job;

  console.log(`[Relevance Router] INITIALIZED | Section: ${section} | Domain: ${domain}`);

  try {
    const result = await runRelevanceRouterAgent(state.job);

    await injectRelevanceRouterOutput(state.climateIntelligenceSetId, state.job, result);

    console.log(`[Relevance Router] FINALIZED | Section: ${section} | Domain: ${domain}`);

    return {
      results: [
        {
          section,
          domain,
          result,
        },
      ],
    };
  } catch (error) {
    console.error(`[Relevance Router] FAILED | Section: ${section} | Domain: ${domain}`);
    if (error instanceof Error) {
      console.error(`  ${error.name}: ${error.message.slice(0, 200)}`);
    }

    // Non-fatal: record the failure so other jobs continue and logs are preserved.
    return {
      results: [
        {
          section,
          domain,
          result: {
            relevantObservations: [],
          } as unknown as Awaited<
            ReturnType<typeof import("../agents/relevanceRouter.agent.js").runRelevanceRouterAgent>
          >,
        },
      ],
    };
  }
}

export function relevanceRouterDispatch(state: RelevanceRouterDispatchState) {
  if (state.jobs.length === 0) {
    return END;
  }

  return state.jobs.map(
    (job) =>
      new Send("relevanceRouter", {
        intelligenceSetId: state.intelligenceSetId,
        climateIntelligenceSetId: state.climateIntelligenceSetId,
        job,
      }),
  );
}

// --------------------------------------------------
// Section and domain definitions
// --------------------------------------------------

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
];

// Domains available per section, matching the climate_briefs table columns.
// Section 02 (Macro & Market Regime) only has geopolitics in the table.
const DOMAINS_BY_SECTION: Record<string, readonly string[]> = {
  "Macro & Market Regime": ["geopolitics"],
  "Sector Conditions": [
    "geopolitics",
    "financial_markets",
    "macro",
    "commodities_energy",
    "crypto",
    "ai_technology_industry",
  ],
  "Important Stories & Narratives": [
    "geopolitics",
    "financial_markets",
    "macro",
    "commodities_energy",
    "crypto",
    "ai_technology_industry",
  ],
  "Trends & Capital Direction": [
    "geopolitics",
    "financial_markets",
    "macro",
    "commodities_energy",
    "crypto",
    "ai_technology_industry",
  ],
  "Outlook, Risks & Uncertainties": [
    "geopolitics",
    "financial_markets",
    "macro",
    "commodities_energy",
    "crypto",
    "ai_technology_industry",
  ],
};

const ALL_DOMAINS = [
  "geopolitics",
  "financial_markets",
  "macro",
  "commodities_energy",
  "crypto",
  "ai_technology_industry",
] as const;

export async function relevanceRouterLoadJobsNode(state: LoadJobsState) {
  // Load ALL observations and research for this intelligence set once.
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

  // Collect observation IDs that already have associated research.
  const researchedObservationIds = new Set(researchRows.map((research) => research.observation_id));

  // Group observations by domain so each section/domain job only sees its own domain.
  const observationsByDomain = new Map<string, ObservationRow[]>();
  for (const domain of ALL_DOMAINS) {
    observationsByDomain.set(domain, []);
  }

  for (const observation of observationsResult.rows) {
    const domain = observation.market_domain;
    if (observationsByDomain.has(domain)) {
      observationsByDomain.get(domain)!.push(observation);
    }
  }

  // Group researched observations by domain.
  const researchedByDomain = new Map<string, ResearchRow[]>();
  for (const domain of ALL_DOMAINS) {
    researchedByDomain.set(domain, []);
  }

  for (const research of researchRows) {
    const domain = research.market_domain;
    if (researchedByDomain.has(domain)) {
      researchedByDomain.get(domain)!.push(research);
    }
  }

  // Create one job for each section and domain combination.
  // Each job only sees the observations for its specific domain.
  const jobs: RelevanceRouterInput[] = [];

  for (const section of sections) {
    const availableDomains = DOMAINS_BY_SECTION[section.name] ?? [];

    for (const domain of availableDomains) {
      const domainObservations = observationsByDomain.get(domain) ?? [];
      const domainResearched = researchedByDomain.get(domain) ?? [];

      // Keep only observations that do not have associated research.
      const unresearched = domainObservations.filter(
        (observation) => !researchedObservationIds.has(observation.id),
      );

      // Preserve researched observations with their associated research.
      const researchedObservations = domainResearched.map((research) => ({
        id: research.id,
        observation_id: research.observation_id,
        observation: research.observation,
        research: research.research,
        market_domain: research.market_domain,
        type: research.type,
      }));

      jobs.push({
        section: section.name,
        sectionInstructions: section.instructions,
        domain,
        observations: unresearched,
        researchedObservations,
      });
    }
  }

  return { jobs };
}
