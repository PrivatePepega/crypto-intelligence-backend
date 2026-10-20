import { createRelevanceRouterGraph } from "./graph/relevanceRouter.graph.js";

const graph = createRelevanceRouterGraph();

async function main() {
  const intelligenceSetId = "3d75914f-661c-4f49-b7cb-f9d8956cada8";
  const climateIntelligenceSetId = "2010feb6-4973-483a-ab86-cccc0955b9ba";



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