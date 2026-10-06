import {
    isStepCount,
    streamText,
    type LanguageModelUsage,
  } from "ai";
  
  import { models } from "../../../AI/providers/model.js";
  
  import {
    type ObserverConfig,
  } from "./observer.config.js";
  
  import {
    getObserverTools,
  } from "../../utils/general.tools.js";
  
  import {
    logObserverStep,
  } from "./observer.logger.js";
  
  const MAX_AGENT_STEPS = 5;
  
  type ResearchEvidence = {
    step: number;
    text: string | null;
    toolCalls: {
      tool: string;
      arguments: unknown;
    }[];
    toolResults: {
      tool: string;
      result: unknown;
    }[];
  };
  
  type ObserverResearchResult = {
    researchText: string;
    researchSteps: Awaited<
      ReturnType<typeof getResearchSteps>
    >;
    researchUsage: LanguageModelUsage;
    researchEvidence: ResearchEvidence[];
    lastReasoningText: string | null;
  };
  
  const getResearchSteps = async (
    result: ReturnType<typeof streamText>,
  ) => {
    return await result.steps;
  };
  
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
  
  export const runObserverResearch = async ({
    config,
    observerPrompt,
    prompt,
  }: {
    config: ObserverConfig;
    observerPrompt: string;
    prompt: string;
  }): Promise<ObserverResearchResult> => {
    const researchResult =
      streamText({
        model: models.openrouter,
  
        instructions:
          observerPrompt,
  
        prompt,
  
        tools:
          getObserverTools(config),
  
        stopWhen:
          isStepCount(
            MAX_AGENT_STEPS,
          ),
  
        onStepEnd: async (step) => {
          logObserverStep(step);
        },
      });
  
    const researchText =
      await researchResult.text;
  
    const researchSteps =
      await getResearchSteps(
        researchResult,
      );
  
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