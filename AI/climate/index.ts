import { createRelevanceRouterGraph } from "./graph/relevanceRouter.graph.js";
import { createResearcherGraph } from "./graph/researcher.graph.js";
import { createAnalystGraph } from "./graph/analyst.graph.js";
import { createWriterGraph } from "./graph/writer.graph.js";
import { initializeEmptyClimateBrief } from "../utils/climate/initializeClimateBrief.js";

const relevanceGraph = createRelevanceRouterGraph();
const researcherGraph = createResearcherGraph();
const analystGraph = createAnalystGraph();
const writerGraph = createWriterGraph();

async function main() {
  const intelligenceSetId = "3d75914f-661c-4f49-b7cb-f9d8956cada8";
  const climateIntelligenceSetId = "2010feb6-4973-483a-ab86-cccc0955b9ba";
  const yesterdayIntelligenceSetId = "894d2ccd-84e7-40af-a106-cd8b8d3b3908";

  // Initialize an empty climate brief — just the identity columns, no foundational data.
  // The relevance router will populate the _data columns as it runs.
  console.log("Initializing empty climate brief...");
  await initializeEmptyClimateBrief(climateIntelligenceSetId);
  console.log("Empty climate brief initialized.");

  console.log("Running relevance router...");
  const relevanceResult = await relevanceGraph.invoke(
    { intelligenceSetId, climateIntelligenceSetId },
    { maxConcurrency: 2 },
  );
  console.log("Relevance Router Complete");
  // console.log(JSON.stringify(relevanceResult.results, null, 2));

  // Research yesterday's brief and write the findings into the current brief's
  // _researcher columns.
  console.log("Running researcher...");
  const researcherResult = await researcherGraph.invoke(
    { yesterdayIntelligenceSetId, climateIntelligenceSetId },
    { maxConcurrency: 2 },
  );
  console.log("Researcher Complete");
  // console.log(JSON.stringify(researcherResult.results, null, 2));

  // Analyze today's relevance router output and researcher findings against
  // yesterday's brief, appending the decisions to the current _analysis columns.
  console.log("Running analyst...");
  const analystResult = await analystGraph.invoke(
    { yesterdayIntelligenceSetId, climateIntelligenceSetId },
    { maxConcurrency: 2 },
  );
  console.log("Analyst Complete");
  // console.log(JSON.stringify(analystResult.results, null, 2));

  // Write today's brief for every section/domain from yesterday's brief and
  // today's analyst notes, replacing the current _data cells.
  console.log("Running writer...");
  const writerResult = await writerGraph.invoke(
    { yesterdayIntelligenceSetId, climateIntelligenceSetId },
    { maxConcurrency: 2 },
  );
  console.log("Writer Complete");
  // console.log(JSON.stringify(writerResult.results, null, 2));
}

main().catch((error) => {
  console.error("Climate pipeline failed:", error);
  process.exitCode = 1;
});
