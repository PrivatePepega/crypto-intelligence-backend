import type {
    LanguageModelUsage,
  } from "ai";
  
  export const logObserverStart = (
    observerContext: string,
  ) => {
    console.log("");
    console.log(
      "==============================================",
    );
    console.log(
      "Observer Starting",
    );
    console.log(
      "==============================================",
    );
  
    console.log(
      `Observer context characters: ${
        observerContext.length
      }`,
    );
  };
  
  export const logObserverPrompt = (
    prompt: string,
  ) => {
    console.log("");
    console.log(
      "----------------------------------------------",
    );
    console.log(
      "Observer Prompt",
    );
    console.log(
      "----------------------------------------------",
    );
  
    console.log(prompt);
  };
  
  export const logObserverStep = (
    step: any,
  ) => {
    console.log("");
    console.log(
      "----------------------------------------------",
    );
    console.log(
      `Observer Research Step ${
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
      `Observer Research Step ${
        step.stepNumber + 1
      } complete.`,
    );
  };
  
  export const logObservableReasoning = (
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
      "Observable reasoning",
    );
    console.log(
      "----------------------------------------------",
    );
  
    console.log(reasoningText);
  };
  
  export const logResearchEvidence = (
    researchEvidence: unknown,
  ) => {
    console.log("");
    console.log(
      "----------------------------------------------",
    );
    console.log(
      "Research Evidence",
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
  
  export const logSynthesisStart = (
    synthesisPrompt: string,
  ) => {
    console.log("");
    console.log(
      "==============================================",
    );
    console.log(
      "Final Synthesis Starting",
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
  
  export const logObserverUsage = ({
    researchUsage,
    synthesisUsage,
    researchSteps,
  }: {
    researchUsage: LanguageModelUsage;
    synthesisUsage: LanguageModelUsage;
    researchSteps: number;
  }) => {
    console.log("");
    console.log(
      "==============================================",
    );
    console.log(
      "Observer Usage",
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
  
  export const logObserverToolUsage = (
    researchSteps: any[],
  ) => {
    console.log("");
    console.log(
      "==============================================",
    );
    console.log(
      "Observer Tool Usage",
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
  
  export const logObserverOutput = (
    finalText: string,
  ) => {
    console.log("");
    console.log(
      "==============================================",
    );
    console.log(
      "Observer Output",
    );
    console.log(
      "==============================================",
    );
  
    console.log(finalText);
  };