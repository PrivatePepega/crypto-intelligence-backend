import pool from "../../config/database.js";

import { captureTerminalOutput } from "../utils/chatbot/terminalOutput.js";
import { createAgentRunLog, type AgentRunLog } from "../utils/logger.js";

import { createChatbotGraph } from "./graph/chatbot.graph.js";

// Change this query to test the chatbot.
// Run with: npx tsx AI/chatbot/index.ts
const USER_QUERY = "what about go woke go broke?";

// The climate brief date to load. Today's brief is not ready yet, so this is
// the latest date we have. In production this should be yesterday's date,
// because the brief is generated once nightly.
const CLIMATE_BRIEF_DATE = "2026-10-20";

// Graph-level answer retries after the Answer Checker rejects a candidate.
const MAX_ANSWER_ATTEMPTS = 3;

// The logger resolves this to AI/data/chat bot output/chatbot-###.json.
const CHATBOT_OUTPUT_AGENT = "chat bot output";
const CHATBOT_OUTPUT_DOMAIN = "chatbot";

const chatbotGraph = createChatbotGraph();

async function main() {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const terminal = captureTerminalOutput();

  let runLog: AgentRunLog | null = null;
  let finalAnswer = "";

  try {
    runLog = await createAgentRunLog(CHATBOT_OUTPUT_AGENT, CHATBOT_OUTPUT_DOMAIN);

    console.log("[Chatbot] Starting...");
    console.log(`[Chatbot] Query: ${USER_QUERY}`);
    console.log(`[Chatbot] Climate brief date: ${CLIMATE_BRIEF_DATE}`);
    console.log(`[Chatbot] Output log: ${runLog.filePath}`);

    await runLog.record("initializer", {
      startedAt,
      userQuery: USER_QUERY,
      climateBriefDate: CLIMATE_BRIEF_DATE,
      maxAnswerAttempts: MAX_ANSWER_ATTEMPTS,
      outputFile: runLog.filePath,
      costNote: "Model costs are recorded in the individual agent run logs.",
    });

    const result = await chatbotGraph.invoke({
      userQuery: USER_QUERY,
      climateBriefDate: CLIMATE_BRIEF_DATE,
      maxAnswerAttempts: MAX_ANSWER_ATTEMPTS,
    });

    finalAnswer = result.finalAnswer;

    const metadata = {
      outOfScope: result.outOfScope,
      checkerPassed: result.checkerPassed,
      answerAttempts: `${result.answerAttempts}/${result.maxAnswerAttempts}`,
      climateBriefDate: result.climateBriefDate,
      climateBriefSource: result.climateBriefSource,
      researchError: result.researchError,
      checkerError: result.checkerError,
    };

    console.log("\n=== Chatbot Answer ===\n");

    if (finalAnswer.trim().length > 0) {
      console.log(finalAnswer);
    } else {
      console.warn("No final answer was produced.");
    }

    console.log("\n=== Run Metadata ===");
    console.log(metadata);

    await runLog.record("result", {
      userQuery: USER_QUERY,
      requestedClimateBriefDate: CLIMATE_BRIEF_DATE,
      finalAnswer,
      outOfScope: result.outOfScope,
      checkerPassed: result.checkerPassed,
      answerAttempts: result.answerAttempts,
      maxAnswerAttempts: result.maxAnswerAttempts,
      loadedClimateBriefDate: result.climateBriefDate,
      climateBriefSource: result.climateBriefSource,
      analyzerQuery: result.analyzerQuery,
      answerExample: result.answerExample,
      researcherOutput: result.researcherOutput,
      researchError: result.researchError,
      checkerError: result.checkerError,
      durationMs: Date.now() - startedAtMs,
    });

    console.log("\n[Chatbot] Complete.");
  } catch (error) {
    console.error("[Chatbot] FAILED:", error);

    if (runLog) {
      await runLog.record("failure", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? (error.stack ?? null) : null,
        durationMs: Date.now() - startedAtMs,
      });
    }

    process.exitCode = 1;
  } finally {
    try {
      if (runLog) {
        await runLog.record("terminal", terminal.entries);
        await runLog.finish(finalAnswer || undefined);
      }
    } finally {
      try {
        terminal.restore();
      } finally {
        await pool.end();
      }
    }
  }
}

main().catch((error) => {
  console.error("[Chatbot] FAILED:", error);
  process.exitCode = 1;
});
