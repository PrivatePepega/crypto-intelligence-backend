import type { ToolSet } from "ai";
import { currentsSearchTool } from "../tools/currentsNewsSearch.js";
import { cvArticlesTagsTool } from "../tools/cvArticlesTags.js";
import { cvBitcoinNewsTool } from "../tools/cvBitcoinNews.js";
import { cvBreakingTool } from "../tools/cvBreaking.js";
import { cvDefiTool } from "../tools/cvDefi.js";
import { cvNewsTool } from "../tools/cvNews.js";
import { cvSearchTool } from "../tools/cvSearch.js";
import { cvTrendingTool } from "../tools/cvTrending.js";
import { finnhubCryptoNewsTool } from "../tools/finnhubCryptoNews.js";
import { fmpGetArticlesListTool } from "../tools/fmpGetArticlesList.js";
import { gdeltSearchEventsTool } from "../tools/gdeltSearchEvents.js";
import { gdeltSearchStoriesTool } from "../tools/gdeltSearchStories.js";
import { getCurrentIndicatorTool } from "../tools/getCurrentIndicatorData.js";
import { marketauxSearchTool } from "../tools/marketauxNewsSearch.js";
import { newsDataCryptoNewsTool } from "../tools/newsDataCryptoNews.js";
import { newsDataLatestNewsTool } from "../tools/newsDataLatestNews.js";
import { newsDataMarketNewsTool } from "../tools/newsDataMarketNews.js";
import { newsflashGetEventsTool } from "../tools/newsflashGetEvents.js";
import { newsflashSearchArticlesTool } from "../tools/newsflashSearchArticles.js";
import { newsMarketsNewsTool } from "../tools/newsMarketsNewsTool.js";
import { wabbleImportantHeadlineSearchTool } from "../tools/wabbleImportantHeadlineSearch.js";
import { webSearchTool } from "../tools/webSearchTool.js";
import type { ObserverConfig } from "../weather/observer/observer.config.js";
import { encodingForModel, type Tiktoken } from "js-tiktoken";
import { exposeCurrentData } from "../../utils/AI/currentDataExpose.js";
import type { RecordedStep, RecordedToolCall, SdkStep } from "../../types/AI/observer.js";
import { getReasoningText } from "./agentResearch.js";



// --------------------------------------------------
// Agentic tooling
// --------------------------------------------------

export const agenticTooling = {
  getCurrentIndicatorData: getCurrentIndicatorTool,

  marketauxNewsSearch: marketauxSearchTool,
  webSearchTool,
  currentsNewsSearch: currentsSearchTool,

  newsflashGetEvents: newsflashGetEventsTool,
  newsflashSearchArticles: newsflashSearchArticlesTool,

  gdeltSearchEvents: gdeltSearchEventsTool,
  gdeltSearchStories: gdeltSearchStoriesTool,

  fmpGetArticlesList: fmpGetArticlesListTool,

  newsDataCryptoNews: newsDataCryptoNewsTool,
  newsDataLatestNews: newsDataLatestNewsTool,
  newsDataMarketNews: newsDataMarketNewsTool,

  cvArticlesTags: cvArticlesTagsTool,
  cvBitcoinNews: cvBitcoinNewsTool,
  cvBreaking: cvBreakingTool,
  cvNews: cvNewsTool,
  cvSearch: cvSearchTool,
  cvTrending: cvTrendingTool,
  cvDefi: cvDefiTool,

  finnhubCryptoNews: finnhubCryptoNewsTool,

  newsMarketsNewsTool,

  wabbleImportantHeadlineSearch: wabbleImportantHeadlineSearchTool,
};

// --------------------------------------------------
// Tool shape helpers
// --------------------------------------------------

export const isTool = (
  value: unknown,
): boolean => {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const tool =
    value as Record<string, unknown>;

  return (
    "inputSchema" in tool ||
    "inputJsonSchema" in tool
  );
};

export const isToolSet = (
  value: unknown,
): value is Record<string, unknown> => {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const entries =
    Object.values(value);

  if (entries.length === 0) {
    return false;
  }

  return entries.every(
    (entry) => isTool(entry),
  );
};

// --------------------------------------------------
// Build agentic ToolSet
// --------------------------------------------------

export const getAgenticTooling = (
  config: ObserverConfig,
): ToolSet => {
  const tools = {} as ToolSet;

  for (const toolName of config.tools) {
    const configuredTool =
      agenticTooling[
        toolName as keyof typeof agenticTooling
      ];

    if (!configuredTool) {
      throw new Error(
        `Agentic tool "${toolName}" is configured but not registered.`,
      );
    }

    // Individual AI SDK tool.
    if (isTool(configuredTool)) {
      (
        tools as Record<
          string,
          unknown
        >
      )[toolName] =
        configuredTool;

      continue;
    }

    // AI SDK ToolSet.
    if (isToolSet(configuredTool)) {
      Object.assign(
        tools,
        configuredTool,
      );

      continue;
    }

    throw new Error(
      `Agentic tool "${toolName}" has an unsupported shape. ` +
        `Expected an AI SDK tool or ToolSet.`,
    );
  }

  return tools;
};

// --------------------------------------------------
// Agentic context
// --------------------------------------------------

type CurrentDataEntry = {
  indicatorId: string;
  seriesId: string;
  indicator: Record<string, unknown>;
  data: unknown;
};

type CurrentDataFile = {
  currentData: Record<string, CurrentDataEntry>;
};

export const getAgenticContext = async (
  config: ObserverConfig,
) => {
  const data =
    await exposeCurrentData() as CurrentDataFile;

  const foundationalData =
    config.foundationalData.map(
      (indicatorId) => {
        const entry =
          Object.values(
            data.currentData,
          ).find(
            (item) =>
              item.seriesId ===
              indicatorId,
          );

        if (!entry) {
          return {
            indicatorId,
            data: null,
          };
        }

        return {
          indicatorId,
          indicator: entry.indicator,
          data: entry.data,
        };
      },
    );

  return JSON.stringify({
    domain: config.domain,
    foundationalData,
  });
};

// --------------------------------------------------
// Token estimation
// --------------------------------------------------

export const encoder: Tiktoken =
  encodingForModel("gpt-4o");

export const estimateTokens = (
  value: unknown,
): number => {
  const serialized =
    typeof value === "string"
      ? value
      : JSON.stringify(value);

  return encoder.encode(
    serialized ?? "",
  ).length;
};

export const countCharacters = (
  value: unknown,
): number => {
  const serialized =
    typeof value === "string"
      ? value
      : JSON.stringify(value);

  return serialized?.length ?? 0;
};

// --------------------------------------------------
// Observable reasoning diagnostics
// --------------------------------------------------
//
// These fields are intentionally read dynamically.
//
// Not every provider/model exposes reasoning data,
// and the exact shape depends on the provider and
// AI SDK version.
//
// This does NOT expose private chain-of-thought.
// It only logs reasoning metadata/content that the
// provider actually makes available to the SDK.
//

export const logObservableReasoning = (
  step: unknown,
) => {
  if (
    typeof step !== "object" ||
    step === null
  ) {
    return;
  }

  const stepData =
    step as Record<string, unknown>;

  const reasoningFields = [
    "reasoning",
    "reasoningText",
    "reasoningDetails",
    "reasoningContent",
  ];

  let foundReasoning =
    false;

  for (const field of reasoningFields) {
    const value =
      stepData[field];

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    foundReasoning = true;

    console.log("");
    console.log(
      `Observable ${field}:`,
    );

    if (
      typeof value === "string"
    ) {
      console.log(value);
    } else {
      console.log(
        JSON.stringify(
          value,
          null,
          2,
        ),
      );
    }
  }

  if (!foundReasoning) {
    console.log("");
    console.log(
      "Observable reasoning: not provided by this model/provider step.",
    );
  }
};



/**
 * Reads a step's reasoning, wherever the provider put it.
 *
 * Providers differ: some expose reasoning on the step, others only on the tool
 * call or tool result. Checking the step alone would record `null` and lose the
 * reasoning, so each carrier is tried in turn and the first hit wins - still one
 * copy per step.
 */
const stepReasoning = (
  step: SdkStep,
): string | null => {
  const carriers: unknown[] = [
    step,
    ...(step.toolCalls ?? []),
    ...(step.toolResults ?? []),
  ];

  for (const carrier of carriers) {
    const found = getReasoningText(
      carrier as SdkStep,
    );

    if (found) {
      return found;
    }
  }

  return null;
};

/**
 * Collapses a research step to reasoning, query input and tool response.
 *
 * The SDK reports a call and its result as two objects that each repeat the
 * tool name, the input and the provider metadata, so recording them verbatim
 * stores the same payload four times over. Pairing them by `toolCallId` keeps
 * each value once and drops the duplicated metadata.
 *
 * A result whose call was not reported is kept rather than dropped, so no tool
 * response is ever lost.
 */
export const normalizeStep = (
  step: SdkStep,
): RecordedStep => {
  const toolCalls = step.toolCalls ?? [];
  const toolResults =
    step.toolResults ?? [];

  const outputByCallId =
    new Map<string, unknown>();

  for (const toolResult of toolResults) {
    outputByCallId.set(
      toolResult.toolCallId,
      toolResult.output,
    );
  }

  const paired: RecordedToolCall[] =
    toolCalls.map((toolCall) => ({
      toolCallId:
        toolCall.toolCallId,

      tool:
        toolCall.toolName,

      input:
        toolCall.input,

      output:
        outputByCallId.get(
          toolCall.toolCallId,
        ) ?? null,
    }));

  const pairedIds = new Set(
    paired.map(
      (call) =>
        call.toolCallId,
    ),
  );

  for (const toolResult of toolResults) {
    if (
      pairedIds.has(
        toolResult.toolCallId,
      )
    ) {
      continue;
    }

    paired.push({
      toolCallId:
        toolResult.toolCallId,

      tool:
        toolResult.toolName,

      input:
        null,

      output:
        toolResult.output,
    });
  }

  return {
    stepNumber:
      step.stepNumber,

    text:
      step.text ?? "",

    reasoning:
      stepReasoning(step),

    toolCalls:
      paired,
  };
};