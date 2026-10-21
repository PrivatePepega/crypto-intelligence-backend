import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type {
  ResearcherInput,
  ResearcherOutput,
} from "../schemas/researcher.schema.js";

import {
  researcherDispatch,
  researcherLoadJobsNode,
  researcherNode,
} from "../nodes/researcher.node.js";

type ResearcherResult = {
  sectionName: string;
  domainName: string;
  column: string;
  result: ResearcherOutput;
};

const GraphState = Annotation.Root({
  yesterdayIntelligenceSetId: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  climateIntelligenceSetId: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  jobs: Annotation<ResearcherInput[]>({
    value: (_, update) => update,
    default: () => [],
  }),

  job: Annotation<ResearcherInput | null>({
    value: (_, update) => update,
    default: () => null,
  }),

  results: Annotation<ResearcherResult[]>({
    value: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export function createResearcherGraph() {
  return new StateGraph(GraphState)
    .addNode("loadJobs", researcherLoadJobsNode)
    .addNode("researcher", researcherNode)
    .addEdge(START, "loadJobs")
    .addConditionalEdges("loadJobs", researcherDispatch)
    .addEdge("researcher", END)
    .compile();
}
