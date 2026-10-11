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
import type { ObserverConfig } from "../weather/weather.config.js";
import { encodingForModel, type Tiktoken } from "js-tiktoken";
import { exposeCurrentData } from "../../utils/AI/currentData testing area/currentDataExpose.js";

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

export const isTool = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const tool = value as Record<string, unknown>;

  return "inputSchema" in tool || "inputJsonSchema" in tool;
};

export const isToolSet = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entries = Object.values(value);

  if (entries.length === 0) {
    return false;
  }

  return entries.every((entry) => isTool(entry));
};

// --------------------------------------------------
// Build agentic ToolSet
// --------------------------------------------------

/**
 * Builds the tool set named by `config.tools`.
 *
 * Typed as `Pick<ObserverConfig, "tools">` rather than the whole config, because
 * the Researcher needs the same tool set without an Observer-shaped config of its
 * own and this is the only field it reads.
 */
export const getAgenticTooling = (config: Pick<ObserverConfig, "tools">): ToolSet => {
  const tools = {} as ToolSet;

  for (const toolName of config.tools) {
    const configuredTool = agenticTooling[toolName as keyof typeof agenticTooling];

    if (!configuredTool) {
      throw new Error(`Agentic tool "${toolName}" is configured but not registered.`);
    }

    // Individual AI SDK tool.
    if (isTool(configuredTool)) {
      (tools as Record<string, unknown>)[toolName] = configuredTool;

      continue;
    }

    // AI SDK ToolSet.
    if (isToolSet(configuredTool)) {
      Object.assign(tools, configuredTool);

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

export const getAgenticContext = async (config: ObserverConfig) => {
  const data = (await exposeCurrentData()) as CurrentDataFile;

  const foundationalData = config.foundationalData.map((indicatorId) => {
    const entry = Object.values(data.currentData).find((item) => item.seriesId === indicatorId);

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
  });

  // Indented rather than compacted. A prompt embedding this as one unbroken line
  // is unreadable to a human reviewing the run log, and the run log's serializer
  // escapes every inner quote on a line with no newlines to break them up - which
  // produced a wall of `\"domain\":\"crypto\"...` in the recorded prompt. Indenting
  // gives the serializer real line breaks to split on.
  return JSON.stringify(
    {
      domain: config.domain,
      foundationalData,
    },
    null,
    2,
  );
};

/**
 * Every indicator in the current dataset, not just the domain's.
 *
 * Same shape as {@link getAgenticContext} apart from the key, so a consumer can
 * read either without knowing which scope produced it. Measured at 105 entries and
 * roughly 78k tokens, against a few thousand for a domain's own set - which is why
 * this is a separate function rather than a flag on the other: the cost difference
 * is two orders of magnitude and callers should see that at the call site.
 *
 * The brief analyst's prompt asks it to select the indicators relevant to its own
 * domain and warns that the dataset may cover several. Supplying the whole dataset
 * is what makes that instruction honest rather than a description of a list that was
 * already filtered.
 */
export const getFullAgenticContext = async (config: ObserverConfig) => {
  const data = (await exposeCurrentData()) as CurrentDataFile;

  const indicators = Object.values(data.currentData).map((entry) => ({
    indicatorId: entry.indicatorId,
    indicator: entry.indicator,
    data: entry.data,
  }));

  // Indented for the same reason as {@link getAgenticContext}: an unbroken line of
  // escaped JSON is unreadable in the run log and gives its serializer nothing to
  // split on.
  return JSON.stringify(
    {
      domain: config.domain,
      indicatorCount: indicators.length,
      indicators,
    },
    null,
    2,
  );
};

// --------------------------------------------------
// Token estimation
// --------------------------------------------------

export const encoder: Tiktoken = encodingForModel("gpt-4o");

export const estimateTokens = (value: unknown): number => {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  return encoder.encode(serialized ?? "").length;
};
