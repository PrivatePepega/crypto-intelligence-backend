import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type {
  AIContextBriefInput,
  AIContextBriefOutput,
} from "../schemas/aiContextBrief.schema.js";

import {
  aiContextBriefDispatch,
  aiContextBriefLoadJobsNode,
  aiContextBriefNode,
} from "../nodes/aiContextBrief.node.js";

type AIContextBriefResult = {
  sectionName: string;
  aiContextBriefColumn: string;
  result: AIContextBriefOutput;
};

const GraphState = Annotation.Root({
  climateIntelligenceSetId: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  jobs: Annotation<AIContextBriefInput[]>({
    value: (_, update) => update,
    default: () => [],
  }),

  job: Annotation<AIContextBriefInput | null>({
    value: (_, update) => update,
    default: () => null,
  }),

  results: Annotation<AIContextBriefResult[]>({
    value: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export function createAIContextBriefGraph() {
  return new StateGraph(GraphState)
    .addNode("loadJobs", aiContextBriefLoadJobsNode)
    .addNode("aiContextBrief", aiContextBriefNode)
    .addEdge(START, "loadJobs")
    .addConditionalEdges("loadJobs", aiContextBriefDispatch)
    .addEdge("aiContextBrief", END)
    .compile();
}
