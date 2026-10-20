import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type { RelevanceRouterInput } from "../schemas/relevanceRouter.schema.js";

import {
  relevanceRouterDispatch,
  relevanceRouterLoadJobsNode,
  relevanceRouterNode,
} from "../nodes/relevanceRouter.node.js";

type RouterResult = {
  section: string;
  domain: string;
  result: Awaited<
    ReturnType<typeof import("../agents/relevanceRouter.agent.js").runRelevanceRouterAgent>
  >;
};

const GraphState = Annotation.Root({
  intelligenceSetId: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  climateIntelligenceSetId: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  jobs: Annotation<RelevanceRouterInput[]>({
    value: (_, update) => update,
    default: () => [],
  }),

  job: Annotation<RelevanceRouterInput | null>({
    value: (_, update) => update,
    default: () => null,
  }),

  results: Annotation<RouterResult[]>({
    value: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export function createRelevanceRouterGraph() {
  return new StateGraph(GraphState)
    .addNode("loadJobs", relevanceRouterLoadJobsNode)
    .addNode("relevanceRouter", relevanceRouterNode)
    .addEdge(START, "loadJobs")
    .addConditionalEdges("loadJobs", relevanceRouterDispatch)
    .addEdge("relevanceRouter", END)
    .compile();
}
