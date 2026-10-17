import type { ToolSet } from "ai";

import google from "../providers/models/google.js";
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
import { freeseaSearchTool } from "../tools/freeseaSearch.js";
import { geminiSearchTool } from "../tools/geminiSearch.js";
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

/**
 * Every tool the agents may name, by the name they name it by.
 *
 * Typed as a plain record rather than as a `ToolSet`, and that is not a loosening for
 * convenience. `ai` and `@ai-sdk/google` each pull in their own copy of
 * `@ai-sdk/provider-utils` (5.0.51 and 5.0.59), so the two `Tool` types are nominally
 * different to TypeScript and a provider-executed tool is not assignable to a
 * `ToolSet` even though it is one. Annotating as `ToolSet` fails on `google_search`;
 * leaving it inferred fails to emit a declaration.
 *
 * The shape of each entry is not left unchecked because of this:
 * {@link getAgenticTooling} runs every value past {@link isTool} or {@link isToolSet}
 * and throws on anything else, so a tool that does not fit is refused at the call site
 * with a message naming it.
 */
export const agenticTooling: Record<string, unknown> = {
  getCurrentIndicatorData: getCurrentIndicatorTool,

  /**
   * Gemini grounded in Google search, standing in for a third-party search API.
   *
   * Client-side like every other tool here - it makes a model call from inside
   * `execute` - so unlike `google_search` it works whatever model the calling agent
   * runs on. That is the reason to prefer it when the question is answerable: it costs
   * one Gemini request instead of one request against a metered search provider.
   */
  geminiSearch: geminiSearchTool,

  /**
   * freesea, as its own tool rather than a fifth webSearch backend.
   *
   * It returns a longer extract of each page's content rather than titles and snippets,
   * so it answers a different question - what a few sources actually say, rather than
   * which pages are worth opening. Client-side like every other tool here, so it works
   * whatever model the calling agent runs on.
   */
  freeseaSearch: freeseaSearchTool,

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

  /**
   * Google's own search, executed by Google rather than by us.
   *
   * A provider-executed tool: the SDK sends the tool name in the request, Google runs
   * the search and returns the results inline. There is no API key of ours to manage,
   * no HTTP call from this process, and no result shape to parse.
   *
   * ## The name is fixed
   *
   * `googleSearch` must be registered under the key `google_search` - the provider
   * rejects any other name, so this is not a naming preference.
   *
   * ## It only works on a Google model
   *
   * This is the one entry in this registry that is provider-specific. It is a
   * provider-executed tool with no local implementation, so naming it in an agent
   * whose model is not Google's will fail the request rather than degrade. Every other
   * tool here is client-side and model-agnostic, which is why this one carries the
   * warning and they do not.
   *
   * Empty arguments, so it uses Google's defaults: web search, no time filter.
   * `searchTypes` and `timeRangeFilter` are available if a caller wants either.
   */
  google_search: google.tools.googleSearch({}),
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
