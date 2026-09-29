
import OpenAI from "openai";
import { cryptoObserverConfig } from "./observer.config.js";
import { getCurrentIndicatorData, observerTools } from "./obersver.tools.js";

const openai = new OpenAI();

// --------------------------------------------------
// Observer limits
// --------------------------------------------------

const MAX_TOOL_ROUNDS = 5;



// --------------------------------------------------
// Observer
// --------------------------------------------------

export const runObserver = async (config: typeof cryptoObserverConfig) => {
  let input: any[] = [
    {
      role: "user",
      content: `
Observe the ${config.domain} domain for today.

Objective:
${config.objective}

Areas of observation:
${config.categories.map((category) => `- ${category}`).join("\n")}

Identify meaningful developments and produce observations.
      `,
    },
  ];

  let toolRounds = 0;

  while (toolRounds < MAX_TOOL_ROUNDS) {
    const response = await openai.responses.create({
      model: "gpt-6-luna",

      instructions: `
You are the Markets Intelligence Platform's Observer.

Your job is to observe what is happening today within the provided domain.

You should:

- inspect deterministic data when useful
- identify meaningful changes
- search the internet
- identify potentially important developments
- distinguish observations from speculation
- remain within the configured observation scope

You should NOT:

- perform deep research
- determine final importance
- invent causes
- invent facts
- speculate beyond available evidence

Use your available tools when deterministic information is required.

Return concise observations when you have enough information.
      `,

      input,
      observerTools,
    });

    // ----------------------------------------------
    // Look for tool calls
    // ----------------------------------------------

    const toolCalls = response.output.filter(
      (item) => item.type === "function_call",
    );

    // No tool calls means the model is finished.
    if (toolCalls.length === 0) {
      console.log("Observer output:");
      console.log(response.output_text);

      return response.output_text;
    }

    // ----------------------------------------------
    // Preserve model output
    // ----------------------------------------------

    input.push(...response.output);

    // ----------------------------------------------
    // Execute requested tools
    // ----------------------------------------------

    toolRounds++;

    for (const toolCall of toolCalls) {
      if (toolCall.name === "get_crypto_market_data") {
        const args = JSON.parse(toolCall.arguments);

        const result = await getCurrentIndicatorData(args.asset);

        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify(result),
        });
      }
    }
  }

  throw new Error(
    `Observer exceeded the maximum tool round limit of ${MAX_TOOL_ROUNDS}.`,
  );
};

// --------------------------------------------------
// Run Crypto Observer
// --------------------------------------------------

runObserver(cryptoObserverConfig);

