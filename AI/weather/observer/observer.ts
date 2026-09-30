import { streamText, stepCountIs } from "ai";

import { cryptoObserverConfig } from "./observer.config.js";
import { observerTools } from "./observer.tools.js";
import { models } from "../../../AI/providers/model.js";

// --------------------------------------------------
// Observer limits
// --------------------------------------------------

const MAX_TOOL_ROUNDS = 5;

// --------------------------------------------------
// Observer
// --------------------------------------------------

export const runObserver = async (
  config = cryptoObserverConfig,
) => {
  const observerPrompt = `
You are the Observer agent for a market intelligence platform.

Your role is breadth.

The intelligence pipeline is:

Observer = breadth
Triage = prioritization
Researcher = depth
Brief Analyst = compression and synthesis
Lead = daily intelligence narrative

You are the Observer.

Your job is to monitor the configured market domain and identify meaningful developments occurring today.

You are an event and market observer, not a researcher.

Start with the deterministic market context available through your tools. Use it to identify meaningful changes, relationships, anomalies, or unusual market activity.

Then identify relevant developments, events, announcements, regulatory actions, security incidents, market narratives, sentiment shifts, geopolitical developments, and other events that may materially affect the configured domain.

The configured domain is your primary subject, but markets do not operate in isolation.

Monitor relevant external markets and events when they may materially affect, explain, or provide important context for the configured domain.

For example, when observing crypto, relevant external context may include equities, interest rates, the US dollar, commodities, macroeconomic developments, global risk sentiment, regulation, and geopolitics.

Do not assume causation.

If crypto declines alongside equities, report the relationship when supported by the available evidence.

Do not claim that equities caused the crypto move unless there is evidence supporting that conclusion.

Your output should contain concise observations about meaningful developments.

Each observation should represent something worth passing to the Triage agent.

Examples:

Change
Bitcoin ETF inflows increased significantly.

Change
Crypto trading volume increased sharply while aggregate market capitalization declined.

Relationship
Crypto markets declined alongside weakness in major equity indexes.

Anomaly
A major divergence appeared between crypto market capitalization and trading activity.

Event
A major cryptocurrency exchange experienced a security incident.

Regulation
A government introduced new legislation affecting digital assets.

Speculation
A major token moved sharply following market discussion of a potential protocol change.

Only report meaningful developments.

Do not report ordinary or unchanged market conditions merely because the data is available.

Do not create observations simply to increase the number of observations.

Search broadly enough to identify meaningful developments, but stop when additional searching is unlikely to produce materially different observations.

You should:

- inspect the available deterministic data
- identify meaningful changes
- identify relationships between markets when supported by evidence
- identify anomalies or unusual activity
- identify relevant external developments
- monitor relevant external markets
- distinguish confirmed events from speculation
- preserve uncertainty when evidence is incomplete
- remain within the configured observation scope
- prioritize breadth over depth

You should NOT:

- perform deep research
- investigate a story exhaustively
- determine final importance
- write the daily intelligence narrative
- invent causes
- invent facts
- speculate beyond available evidence
- turn ordinary market conditions into observations
- create observations merely to increase output count
- include URLs or citations in the observation text
- include source names or references in the observation text
- use Markdown formatting such as bold text, headings, or numbered lists

Sources and supporting evidence are handled separately by the system.

Return concise observations when you have enough information.

The goal is not to produce a fixed number of observations.

The goal is to discover the meaningful things that happened.
`;

  const prompt = `
Observe the ${config.domain} domain for today.

Objective:
${config.objective}

Areas of observation:
${config.categories
  .map((category) => `- ${category}`)
  .join("\n")}

Identify meaningful developments and produce observations.
`;

  // --------------------------------------------------
  // Run Observer
  // --------------------------------------------------

  console.log("");
  console.log("==============================================");
  console.log("Observer Starting");
  console.log("==============================================");

  const result = streamText({
    model: models.groq,

    instructions: observerPrompt,

    prompt,

    tools: observerTools,

    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
  });

  // --------------------------------------------------
  // Stream Observer events
  // --------------------------------------------------

  let stepNumber = 0;

  for await (const part of result.fullStream) {
    switch (part.type) {
      // ----------------------------------------------
      // Step started
      // ----------------------------------------------

      case "start-step": {
        stepNumber++;

        console.log("");
        console.log("----------------------------------------------");
        console.log(`Observer Step ${stepNumber}`);
        console.log("----------------------------------------------");

        break;
      }

      // ----------------------------------------------
      // Model text
      // ----------------------------------------------

      case "text-delta": {
        process.stdout.write(part.text);

        break;
      }

      // ----------------------------------------------
      // Tool call
      // ----------------------------------------------

      case "tool-call": {
        console.log("");
        console.log("");
        console.log("Tool call:");
        console.log(`Tool: ${part.toolName}`);
        console.log(
          `Arguments: ${JSON.stringify(part.input)}`,
        );

        break;
      }

      // ----------------------------------------------
      // Tool result
      // ----------------------------------------------

      case "tool-result": {
        console.log("");
        console.log("");
        console.log("Tool result:");
        console.log(`Tool: ${part.toolName}`);
        console.log(
          `Result: ${JSON.stringify(part.output)}`,
        );

        break;
      }

      // ----------------------------------------------
      // Tool error
      // ----------------------------------------------

      case "tool-error": {
        console.log("");
        console.log("");
        console.log("Tool error:");
        console.log(`Tool: ${part.toolName}`);
        console.log(
          `Error: ${JSON.stringify(part.error)}`,
        );

        break;
      }

      // ----------------------------------------------
      // Step finished
      // ----------------------------------------------

      case "finish-step": {
        console.log("");
        console.log("");
        console.log(`Observer Step ${stepNumber} complete.`);

        break;
      }

      // ----------------------------------------------
      // Error
      // ----------------------------------------------

      case "error": {
        console.error("");
        console.error("Observer stream error:");
        console.error(part.error);

        break;
      }

      default:
        break;
    }
  }

  // --------------------------------------------------
  // Resolve final result
  // --------------------------------------------------

  const finalText = await result.text;
  const steps = await result.steps;
  const usage = await result.usage;

  // --------------------------------------------------
  // Usage
  // --------------------------------------------------

  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;

  console.log("");
  console.log("==============================================");
  console.log("Observer Usage");
  console.log("==============================================");

  console.log(`Input tokens:  ${inputTokens}`);
  console.log(`Output tokens: ${outputTokens}`);
  console.log(`Steps:         ${steps.length}`);

  console.log("==============================================");

  // --------------------------------------------------
  // Tool usage summary
  // --------------------------------------------------

  const toolCalls = steps.flatMap(
    (step) => step.toolCalls ?? [],
  );

  console.log("");
  console.log("----------------------------------------------");
  console.log("Observer Tool Usage");
  console.log("----------------------------------------------");

  console.log(`Tool calls: ${toolCalls.length}`);

  for (const toolCall of toolCalls) {
    console.log("");
    console.log(`Tool: ${toolCall.toolName}`);

    console.log(
      `Arguments: ${JSON.stringify(toolCall.input)}`,
    );
  }

  // --------------------------------------------------
  // Final Observer output
  // --------------------------------------------------

  console.log("");
  console.log("----------------------------------------------");
  console.log("Observer Final Output");
  console.log("----------------------------------------------");

  console.log(
    finalText || "(no text output)",
  );

  console.log("");
  console.log("==============================================");
  console.log("Observer Complete");
  console.log("==============================================");

  return finalText;
};