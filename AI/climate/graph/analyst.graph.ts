import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type { AnalystInput, AnalystOutput } from "../schemas/analyst.schema.js";

import { analystDispatch, analystLoadJobsNode, analystNode } from "../nodes/analyst.node.js";

type AnalystResult = {
  sectionName: string;
  domainName: string;
  column: string;
  incomingDataType: AnalystInput["incomingDataType"];
  result: AnalystOutput;
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

  jobs: Annotation<AnalystInput[]>({
    value: (_, update) => update,
    default: () => [],
  }),

  job: Annotation<AnalystInput | null>({
    value: (_, update) => update,
    default: () => null,
  }),

  results: Annotation<AnalystResult[]>({
    value: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export function createAnalystGraph() {
  return new StateGraph(GraphState)
    .addNode("loadJobs", analystLoadJobsNode)
    .addNode("analyst", analystNode)
    .addEdge(START, "loadJobs")
    .addConditionalEdges("loadJobs", analystDispatch)
    .addEdge("analyst", END)
    .compile();
}
