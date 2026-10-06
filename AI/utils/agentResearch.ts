import {
    isStepCount,
    streamText,
  } from "ai";
  
  const getReasoningText = (
    step: any,
  ): string | null => {
    if (
      typeof step.reasoning === "string" &&
      step.reasoning.trim()
    ) {
      return step.reasoning.trim();
    }
  
    if (
      Array.isArray(step.reasoning)
    ) {
      const reasoningText =
        step.reasoning
          .filter(
            (item: any) =>
              typeof item?.text === "string",
          )
          .map(
            (item: any) =>
              item.text,
          )
          .join("\n")
          .trim();
  
      if (reasoningText) {
        return reasoningText;
      }
    }
  
    const reasoningDetails =
      step.providerMetadata
        ?.openrouter
        ?.reasoning_details;
  
    if (
      Array.isArray(reasoningDetails)
    ) {
      const reasoningText =
        reasoningDetails
          .filter(
            (item: any) =>
              item?.type ===
                "reasoning.text" &&
              typeof item?.text ===
                "string",
          )
          .map(
            (item: any) =>
              item.text,
          )
          .join("\n")
          .trim();
  
      if (reasoningText) {
        return reasoningText;
      }
    }
  
    return null;
  };
  
  export const runAgentResearch = async ({
    model,
    instructions,
    prompt,
    tools,
    maxSteps,
    onStepEnd,
  }: {
    model: Parameters<
      typeof streamText
    >[0]["model"];
  
    instructions: string;
  
    prompt: string;
  
    tools?: Parameters<
      typeof streamText
    >[0]["tools"];
  
    maxSteps: number;
  
    onStepEnd?: Parameters<
      typeof streamText
    >[0]["onStepEnd"];
  }) => {
    const researchOptions = {
      model,
      instructions,
      prompt,
      stopWhen:
        isStepCount(maxSteps),
    } as Parameters<
      typeof streamText
    >[0];
  
    if (tools) {
      researchOptions.tools =
        tools;
    }
  
    if (onStepEnd) {
      researchOptions.onStepEnd =
        onStepEnd;
    }
  
    const researchResult =
      streamText(
        researchOptions,
      );
  
    const researchText =
      await researchResult.text;
  
    const researchSteps =
      await researchResult.steps;
  
    const researchUsage =
      await researchResult.usage;
  
    let lastReasoningText:
      | string
      | null = null;
  
    for (const step of researchSteps) {
      const reasoningText =
        getReasoningText(step);
  
      if (reasoningText) {
        lastReasoningText =
          reasoningText;
      }
    }
  
    const researchEvidence =
      researchSteps
        .filter(
          (step) =>
            step.toolCalls.length > 0 ||
            step.toolResults.length > 0 ||
            Boolean(step.text),
        )
        .map((step) => ({
          step:
            step.stepNumber + 1,
  
          text:
            step.text || null,
  
          toolCalls:
            step.toolCalls.map(
              (toolCall) => ({
                tool:
                  toolCall.toolName,
  
                arguments:
                  toolCall.input,
              }),
            ),
  
          toolResults:
            step.toolResults.map(
              (toolResult) => ({
                tool:
                  toolResult.toolName,
  
                result:
                  toolResult.output,
              }),
            ),
        }));
  
    return {
      researchText,
      researchSteps,
      researchUsage,
      researchEvidence,
      lastReasoningText,
    };
  };