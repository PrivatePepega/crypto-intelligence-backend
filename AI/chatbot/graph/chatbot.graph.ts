import { END, START, StateGraph } from "@langchain/langgraph";

import {
  analyzerNode,
  answerCheckerNode,
  answerGeneratorNode,
  fallbackResponseNode,
  outOfScopeResponseNode,
  prepareRetryNode,
  researcherNode,
  routeAfterAnalyzer,
  routeAfterChecker,
} from "../nodes/chatBot.nodes.js";

import { ChatbotState } from "../schemas/chatbot.schema.js";

/**
 * Builds the chatbot graph:
 *
 *   analyzer ── out_of_scope ── END
 *      │
 *      └── researcher ── answer_generator ── answer_checker
 *                                                │
 *                          ┌─────────────────────┼─────────────────────┐
 *                          │                     │                     │
 *                         pass                 retry               exhausted
 *                          │                     │                     │
 *                         END              prepare_retry         fallback_response
 *                                                │                     │
 *                                     answer_generator              END
 */
export function createChatbotGraph() {
  const graph = new StateGraph(ChatbotState)
    .addNode("analyzer", analyzerNode)
    .addNode("out_of_scope", outOfScopeResponseNode)
    .addNode("researcher", researcherNode)
    .addNode("answer_generator", answerGeneratorNode)
    .addNode("answer_checker", answerCheckerNode)
    .addNode("prepare_retry", prepareRetryNode)
    .addNode("fallback_response", fallbackResponseNode)

    .addEdge(START, "analyzer")

    .addConditionalEdges("analyzer", routeAfterAnalyzer, {
      in_scope: "researcher",
      out_of_scope: "out_of_scope",
    })

    .addEdge("out_of_scope", END)

    .addEdge("researcher", "answer_generator")
    .addEdge("answer_generator", "answer_checker")

    .addConditionalEdges("answer_checker", routeAfterChecker, {
      pass: END,
      retry: "prepare_retry",
      exhausted: "fallback_response",
    })

    .addEdge("prepare_retry", "answer_generator")
    .addEdge("fallback_response", END);

  return graph.compile();
}
