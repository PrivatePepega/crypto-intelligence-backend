import type {
    LanguageModelUsage,
  } from "ai";
  
  // --------------------------------------------------
  // Agent start
  // --------------------------------------------------
  
  export const logAgentStart = (
    agentName: string,
    context: string,
  ) => {
    console.log("");
    console.log(
      "==============================================",
    );
    console.log(
      `${agentName} Starting`,
    );
    console.log(
      "==============================================",
    );
  
    console.log(
      `${agentName} context characters: ${
        context.length
      }`,
    );
  };
  
  // --------------------------------------------------
  // Agent prompt
  // --------------------------------------------------
  
  export const logAgentPrompt = (
    agentName: string,
    prompt: string,
  ) => {
    console.log("");
    console.log(
      "----------------------------------------------",
    );
    console.log(
      `${agentName} Prompt`,
    );
    console.log(
      "----------------------------------------------",
    );
  
    console.log(prompt);
  };
  
  // --------------------------------------------------
  // Agent research step
  // --------------------------------------------------
  
  export const logAgentStep = (
    agentName: string,
    step: any,
  ) => {
    console.log("");
    console.log(
      "----------------------------------------------",
    );
    console.log(
      `${agentName} Research Step ${
        step.stepNumber + 1
      }`,
    );
    console.log(
      "----------------------------------------------",
    );
  
    if (step.toolCalls?.length > 0) {
      console.log("");
      console.log("Tool call:");
  
      for (const toolCall of step.toolCalls) {
        console.log(
          `Tool: ${toolCall.toolName}`,
        );
  
        console.log(
          `Arguments: ${JSON.stringify(
            toolCall.input,
            null,
            2,
          )}`,
        );
      }
    }
  
    if (step.toolResults?.length > 0) {
      console.log("");
  
      for (const toolResult of step.toolResults) {
        console.log(
          `Tool result: ${toolResult.toolName}`,
        );
  
        console.log(
          `Result: ${JSON.stringify(
            toolResult.output,
            null,
            2,
          )}`,
        );
      }
    }
  
    console.log("");
    console.log(
      `${agentName} Research Step ${
        step.stepNumber + 1
      } complete.`,
    );
  };
  
  // --------------------------------------------------
  // Observable reasoning
  // --------------------------------------------------
  
  export const logAgentReasoning = (
    agentName: string,
    reasoningText: string | null,
  ) => {
    if (!reasoningText) {
      return;
    }
  
    console.log("");
    console.log(
      "----------------------------------------------",
    );
    console.log(
      `${agentName} Observable Reasoning`,
    );
    console.log(
      "----------------------------------------------",
    );
  
    console.log(reasoningText);
  };
  
  // --------------------------------------------------
  // Research evidence
  // --------------------------------------------------
  
  export const logAgentResearchEvidence = (
    agentName: string,
    researchEvidence: unknown,
  ) => {
    console.log("");
    console.log(
      "----------------------------------------------",
    );
    console.log(
      `${agentName} Research Evidence`,
    );
    console.log(
      "----------------------------------------------",
    );
  
    console.log(
      JSON.stringify(
        researchEvidence,
        null,
        2,
      ),
    );
  };
  
  // --------------------------------------------------
  // Synthesis start
  // --------------------------------------------------
  
  export const logAgentSynthesisStart = (
    agentName: string,
    synthesisPrompt: string,
  ) => {
    console.log("");
    console.log(
      "==============================================",
    );
    console.log(
      `${agentName} Final Synthesis Starting`,
    );
    console.log(
      "==============================================",
    );
  
    console.log("");
    console.log(
      "Synthesis Prompt",
    );
    console.log(
      "----------------------------------------------",
    );
  
    console.log(
      synthesisPrompt,
    );
  };
  
  // --------------------------------------------------
  // Usage
  // --------------------------------------------------
  
  export const logAgentUsage = ({
    agentName,
    researchUsage,
    synthesisUsage,
    researchSteps,
  }: {
    agentName: string;
    researchUsage: LanguageModelUsage;
    synthesisUsage: LanguageModelUsage;
    researchSteps: number;
  }) => {
    console.log("");
    console.log(
      "==============================================",
    );
    console.log(
      `${agentName} Usage`,
    );
    console.log(
      "==============================================",
    );
  
    console.log(
      `Research input tokens: ${
        researchUsage.inputTokens ?? 0
      }`,
    );
  
    console.log(
      `Research output tokens: ${
        researchUsage.outputTokens ?? 0
      }`,
    );
  
    console.log(
      `Synthesis input tokens: ${
        synthesisUsage.inputTokens ?? 0
      }`,
    );
  
    console.log(
      `Synthesis output tokens: ${
        synthesisUsage.outputTokens ?? 0
      }`,
    );
  
    console.log(
      `Research steps: ${researchSteps}`,
    );
  
    console.log(
      "Final synthesis: 1",
    );
  
    console.log(
      "==============================================",
    );
  };
  
  // --------------------------------------------------
  // Tool usage
  // --------------------------------------------------
  
  export const logAgentToolUsage = (
    agentName: string,
    researchSteps: any[],
  ) => {
    console.log("");
    console.log(
      "==============================================",
    );
    console.log(
      `${agentName} Tool Usage`,
    );
    console.log(
      "==============================================",
    );
  
    for (const step of researchSteps) {
      for (const toolCall of step.toolCalls ?? []) {
        console.log(
          `Step ${
            step.stepNumber + 1
          }: ${toolCall.toolName}`,
        );
      }
    }
  };
  
  // --------------------------------------------------
  // Final output
  // --------------------------------------------------
  
  export const logAgentOutput = (
    agentName: string,
    finalText: string,
  ) => {
    console.log("");
    console.log(
      "==============================================",
    );
    console.log(
      `${agentName} Output`,
    );
    console.log(
      "==============================================",
    );
  
    console.log(finalText);
  };