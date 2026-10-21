import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type { HumanBriefInput } from "../schemas/humanBrief.schema.js";

import {
  humanBriefDispatch,
  humanBriefLoadJobsNode,
  humanBriefNode,
} from "../nodes/humanBrief.node.js";

type HumanBriefResult = {
  sectionName: string;
  humanBriefColumn: string;
  result: string;
};

const GraphState = Annotation.Root({
  climateIntelligenceSetId: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  jobs: Annotation<HumanBriefInput[]>({
    value: (_, update) => update,
    default: () => [],
  }),

  job: Annotation<HumanBriefInput | null>({
    value: (_, update) => update,
    default: () => null,
  }),

  results: Annotation<HumanBriefResult[]>({
    value: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export function createHumanBriefGraph() {
  return new StateGraph(GraphState)
    .addNode("loadJobs", humanBriefLoadJobsNode)
    .addNode("humanBrief", humanBriefNode)
    .addEdge(START, "loadJobs")
    .addConditionalEdges("loadJobs", humanBriefDispatch)
    .addEdge("humanBrief", END)
    .compile();
}
