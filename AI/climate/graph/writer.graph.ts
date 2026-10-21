import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type { WriterInput, WriterOutput } from "../schemas/writer.schema.js";

import { writerDispatch, writerLoadJobsNode, writerNode } from "../nodes/writer.node.js";

type WriterResult = {
  sectionName: string;
  domainName: string;
  column: string;
  result: WriterOutput;
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

  jobs: Annotation<WriterInput[]>({
    value: (_, update) => update,
    default: () => [],
  }),

  job: Annotation<WriterInput | null>({
    value: (_, update) => update,
    default: () => null,
  }),

  results: Annotation<WriterResult[]>({
    value: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export function createWriterGraph() {
  return new StateGraph(GraphState)
    .addNode("loadJobs", writerLoadJobsNode)
    .addNode("writer", writerNode)
    .addEdge(START, "loadJobs")
    .addConditionalEdges("loadJobs", writerDispatch)
    .addEdge("writer", END)
    .compile();
}
