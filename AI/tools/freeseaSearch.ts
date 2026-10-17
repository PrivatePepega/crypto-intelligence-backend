import { tool } from "ai";
import { z } from "zod";

import { searchFreeSea } from "../providers/webSearch/freesea/client.js";
import { normalizeFreeSeaResults } from "../providers/webSearch/freesea/normalizer.js";

/**
 * freesea, as its own tool rather than another failover backend.
 *
 * It is a different kind of search from the others. Brave, Exa and You return titles and
 * short excerpts of many pages; freesea returns a longer extract of each page's actual
 * content. That is closer to having read the article, which is a different thing to ask
 * an agent for and worth a separate tool rather than a hidden branch inside the general
 * one - where it would only ever be reached if the faster providers happened to be out.
 *
 * ## Deliberately plain
 *
 * The description and inputs here are the minimum that makes the tool usable, not the
 * finished version. They should be rewritten once the raw responses have been graded on
 * real queries - what it returns for financial questions, how long the extracts are, and
 * whether the index carries news or leans commercial - is what a good description is
 * written from. Guessing at it now would only harden an assumption.
 *
 * Advertisements are dropped rather than returned. See the normaliser for why that is
 * not negotiable for this pipeline.
 */
export const freeseaSearchTool = tool({
  description:
    "Search the web and return a text extract from each result. " +
    "Unlike a ranked list of links, this returns a readable chunk of what each page actually says, " +
    "which is useful when you want the substance of a few sources rather than a list to choose from.",

  inputSchema: z.object({
    query: z.string().describe("What to search for."),

    max_results: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("How many results to fetch. freesea caps this at 20."),
  }),

  execute: async ({ query, max_results }) => await freeseaSearch(query, max_results),
});

export type FreeSeaSearchResult = {
  title: string;

  /** The page's extract. Longer than a snippet in the other search providers. */
  content: string;

  /** The page's address, when the result carried one. */
  url: string | null;

  /** The host, split off the URL so it can be weighed without parsing the address. */
  domain: string | null;
};

export type FreeSeaSearchResponse = {
  results: FreeSeaSearchResult[];

  /**
   * How many results were advertisements and were dropped.
   *
   * Reported because a query that comes back mostly ads has not really searched
   * anything, and that is not visible anywhere else in the response.
   */
  sponsoredDropped: number;
};

/**
 * Runs one freesea search.
 *
 * The request/response split lives in the provider folder; this is the part the agent
 * uses, and it does nothing beyond normalising what came back.
 */
export const freeseaSearch = async (
  query: string,
  maxResults: number = 10,
): Promise<FreeSeaSearchResponse> => {
  const response = await searchFreeSea(query, maxResults);

  const normalized = normalizeFreeSeaResults(response);

  // The domain is read off the URL rather than taken from the provider, because the
  // normaliser deliberately keeps the URL exactly as it arrived and two providers spell
  // their domain field differently.
  const results = normalized.results.map((result) => ({
    title: result.title,
    content: result.description,
    url: result.url,

    domain: hostOf(result.url),
  }));

  return { results, sponsoredDropped: normalized.sponsoredDropped };
};

/** The host of an address, or null when there isn't a usable one. */
const hostOf = (url: string | null): string | null => {
  if (url === null) return null;

  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};
