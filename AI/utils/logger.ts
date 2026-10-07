import type {
  LanguageModelUsage,
} from "ai";

// --------------------------------------------------
// Agent start
// --------------------------------------------------

export const logAgentStart = (
  agentName: string,
  initialContextTokens: number,
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
    `${agentName} initial context tokens (estimated): ${initialContextTokens}`,
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
// Research notes
// --------------------------------------------------

export const logAgentResearchNotes = (
  agentName: string,
  researchNotes: string,
) => {
  console.log("");
  console.log(
    "----------------------------------------------",
  );
  console.log(
    `${agentName} Research Notes`,
  );
  console.log(
    "----------------------------------------------",
  );

  console.log(researchNotes);
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
  initialContextTokens,
  researchUsage,
  researchNotesUsage,
  synthesisUsage,
  researchSteps,
}: {
  agentName: string;
  initialContextTokens: number;
  researchUsage: LanguageModelUsage;
  researchNotesUsage: LanguageModelUsage;
  synthesisUsage: LanguageModelUsage;
  researchSteps: number;
}) => {
  const researchTotalTokens =
    researchUsage.totalTokens ?? 0;

  const researchNotesTotalTokens =
    researchNotesUsage.totalTokens ?? 0;

  const synthesisTotalTokens =
    synthesisUsage.totalTokens ?? 0;

  const totalRunTokens =
    researchTotalTokens +
    researchNotesTotalTokens +
    synthesisTotalTokens;

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

  console.log("");
  console.log(
    "Research initial context:",
  );
  console.log(
    `Estimated tokens: ${initialContextTokens}`,
  );

  console.log("");
  console.log(
    "Research cumulative:",
  );
  console.log(
    `Input tokens: ${
      researchUsage.inputTokens ?? 0
    }`,
  );
  console.log(
    `Output tokens: ${
      researchUsage.outputTokens ?? 0
    }`,
  );
  console.log(
    `Total tokens: ${researchTotalTokens}`,
  );

  console.log("");
  console.log(
    "Research Notes:",
  );
  console.log(
    `Input tokens: ${
      researchNotesUsage.inputTokens ?? 0
    }`,
  );
  console.log(
    `Output tokens: ${
      researchNotesUsage.outputTokens ?? 0
    }`,
  );
  console.log(
    `Total tokens: ${researchNotesTotalTokens}`,
  );

  console.log("");
  console.log(
    "Synthesis:",
  );
  console.log(
    `Input tokens: ${
      synthesisUsage.inputTokens ?? 0
    }`,
  );
  console.log(
    `Output tokens: ${
      synthesisUsage.outputTokens ?? 0
    }`,
  );
  console.log(
    `Total tokens: ${synthesisTotalTokens}`,
  );

  console.log("");
  console.log(
    `TOTAL RUN TOKENS: ${totalRunTokens}`,
  );

  console.log("");
  console.log(
    `Research steps: ${researchSteps}`,
  );

  console.log(
    "Research Notes: 1",
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