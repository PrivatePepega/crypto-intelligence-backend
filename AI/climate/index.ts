import { createRelevanceRouterGraph } from "./graph/relevanceRouter.graph.js";
import { initializeEmptyClimateBrief } from "../utils/climate/initializeClimateBrief.js";

const graph = createRelevanceRouterGraph();

async function main() {
    const intelligenceSetId = "3d75914f-661c-4f49-b7cb-f9d8956cada8";
    const climateIntelligenceSetId = "2010feb6-4973-483a-ab86-cccc0955b9ba";
    const yesterdayIntelligenceSetId = "894d2ccd-84e7-40af-a106-cd8b8d3b3908"
  // Initialize an empty climate brief — just the identity columns, no foundational data.
  // The relevance router will populate the _data columns as it runs.
  console.log("Initializing empty climate brief...");
  await initializeEmptyClimateBrief(climateIntelligenceSetId);
  console.log("Empty climate brief initialized.");

  const result = await graph.invoke(
    { intelligenceSetId, climateIntelligenceSetId },
    { maxConcurrency: 2 },
  );

  console.log(JSON.stringify(result.results, null, 2));
}

main().catch((error) => {
  console.error("Relevance Router failed:", error);
  process.exitCode = 1;
});
