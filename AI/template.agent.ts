import OpenAI from "openai";

const openai = new OpenAI();


// --------------------------------------------------
// Example deterministic tool
// --------------------------------------------------

const getCryptoMarketData = async (asset: string) => {
  // This is fake for now.
  // Later this will query our PostgreSQL deterministic data.

  return {
    asset,
    price: 112430,
    change24h: 5.8,
    observedAt: new Date().toISOString(),
  };
};


// --------------------------------------------------
// Tool definitions given to the model
// --------------------------------------------------

const tools = [
  {
    type: "function" as const,
    name: "get_crypto_market_data",
    description:
      "Retrieve the latest deterministic market data for a cryptocurrency.",
    parameters: {
      type: "object",
      properties: {
        asset: {
          type: "string",
          description:
            "Cryptocurrency symbol such as BTC, ETH, SOL, or XRP.",
        },
      },
      required: ["asset"],
      additionalProperties: false,
    },
    strict: true,
  },
];


// --------------------------------------------------
// Observer
// --------------------------------------------------

export const runObserver = async () => {
  let input: any[] = [
    {
      role: "user",
      content:
        "Observe the crypto category for today. Identify meaningful market developments.",
    },
  ];

  while (true) {
    const response = await openai.responses.create({
      model: "gpt-6-luna",

      instructions: `
You are the Crypto Intelligence Platform's Observer.

Your job is to observe what is happening today.

Identify meaningful developments and produce observations.

You should:
- inspect deterministic data when useful
- identify meaningful changes
- identify potentially important developments
- distinguish observations from speculation

You should NOT:
- perform deep research
- determine final importance
- invent causes
- invent facts

Use your available tools when deterministic information is required.

Return a concise observation when you have enough information.
      `,

      input,

      tools,
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

    for (const toolCall of toolCalls) {
      if (toolCall.name === "get_crypto_market_data") {
        const args = JSON.parse(toolCall.arguments);

        const result = await getCryptoMarketData(args.asset);

        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify(result),
        });
      }
    }
  }
};