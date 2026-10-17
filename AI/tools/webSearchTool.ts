import { tool } from "ai";
import { z } from "zod";

import { searchExa } from "../providers/webSearch/exa/client.js";
import { normalizeExaResults } from "../providers/webSearch/exa/normalizer.js";
import { searchTavily } from "../providers/webSearch/tavily/client.js";
import { normalizeTavilyResults } from "../providers/webSearch/tavily/normalizer.js";
import { searchBrave } from "../providers/webSearch/brave/client.js";
import { normalizeBraveResults } from "../providers/webSearch/brave/normalizer.js";
import { searchYou } from "../providers/webSearch/you/client.js";
import { normalizeYouResults } from "../providers/webSearch/you/normalizer.js";

// --------------------------------------------------
// Web search, with provider failover
// --------------------------------------------------
//
// Four search providers are configured and their free allowances are not equal. Brave
// and You answer in under a second; Exa takes several; Tavily's allowance is currently
// spent outright. Routing everything through one provider therefore means the pipeline
// loses search entirely the moment that one provider runs out, rather than one provider
// running out.
//
// ## Why the results are reshaped here
//
// The four normalisers each return their provider's own shape - Brave gives
// `extraSnippets` and an `faq` block, Exa gives `highlights`, You gives `snippets`.
// A failover that returned a different shape depending on which provider happened to
// answer would be a trap: the agent would have to handle four shapes to read the same
// tool, and would silently get less depending on quota. So every provider is mapped
// onto one result shape below, and the tool's contract does not change when the
// provider does.
//
// ## Why a spent provider stays spent for the process
//
// A plan or quota limit does not recover during a run. Marking one exhausted means the
// rest of the run does not keep paying a round-trip to find out again - which matters,
// because a research run calls search dozens of times. A network failure is treated
// differently: it does not prove the provider is out of allowance, so that provider
// keeps its place in the rotation.
// --------------------------------------------------

/** Results requested per provider when the agent does not choose a count. */
export const DEFAULT_SEARCH_LIMIT = 30;

/** One search result, whatever provider produced it. */
export type WebSearchResult = {
  title: string;

  /**
   * The result's own summary, when the provider gives one.
   *
   * Empty rather than absent when a provider has none, so the agent never has to check
   * whether the key is there.
   */
  description: string;

  /** Extra excerpts, whatever the provider called them. */
  snippets: string[];

  /** The page's URL, when the provider returned one. */
  url: string | null;
};

/** What the tool returns. Stable across providers, which is the point. */
export type WebSearchResponse = {
  /** Which provider actually answered. Recorded so a run log says which one to trust. */
  provider: string;

  results: WebSearchResult[];

  /** Direct question-and-answer pairs, when the provider offered any. */
  faq: { question: string; answer: string }[];

  /**
   * Providers never tried, because they were already known to be out of allowance when
   * this call started.
   *
   * Distinct from {@link WebSearchResponse.failed}: a provider listed there was tried
   * during this call and failed, whereas one listed here was skipped outright.
   */
  skipped: SearchProviderName[];

  /**
   * What went wrong with the providers that did not answer.
   *
   * Present so a degraded search is visible in the run log rather than looking like a
   * quiet result set. Empty when the first provider answered.
   */
  failed: { provider: SearchProviderName; error: string }[];
};

type SearchProvider = {
  search: (query: string, limit: number) => Promise<unknown>;
  normalize: (response: never) => unknown;
};

export const searchProviders = {
  brave: { search: searchBrave, normalize: normalizeBraveResults },
  tavily: { search: searchTavily, normalize: normalizeTavilyResults },
  exa: { search: searchExa, normalize: normalizeExaResults },
  you: { search: searchYou, normalize: normalizeYouResults },
};

/**
 * The order providers are tried in.
 *
 * Brave first because it is the fastest of the working ones, then You, which is also
 * sub-second. Exa is slower but answers different things, so it earns a place before
 * Tavily rather than after. Tavily is last because its allowance is presently spent and
 * will simply be marked exhausted on the first call - deliberate, so an upgrade to that
 * plan starts working again with no code change.
 *
 * freesea is not in this list. It returns a longer extract of each page's content
 * rather than titles and snippets, which is a different question to put to an agent, so
 * it is its own tool - see {@link freeseaSearchTool}. Putting it here would mean it was
 * only ever reached when the faster providers happened to be out.
 */
export const SEARCH_PROVIDER_ORDER = ["brave", "you", "exa", "tavily"] as const;

export type SearchProviderName = (typeof SEARCH_PROVIDER_ORDER)[number];

/**
 * Providers whose allowance is known to be gone, for the rest of this process.
 *
 * A module-level set rather than a parameter because the fact outlives any one call: a
 * research run searching forty times should discover an exhausted provider once, not
 * forty times.
 */
const exhausted = new Set<SearchProviderName>();

/**
 * Forgets which providers have run out, so the next search tries them again.
 *
 * Exhaustion lasts for the process by default, which is what a single run wants - a
 * research run searching dozens of times should discover a spent provider once rather
 * than on every call. A process that runs for many hours should call this once at the
 * start of each run instead, so a provider whose allowance has since reset is picked up
 * again rather than written off for the life of the server.
 *
 * Also what makes this state reachable from a test, which is how the failover was
 * verified at all.
 */
export const resetSearchProviders = (): void => {
  exhausted.clear();
};

/**
 * Whether an error means the provider has no allowance left.
 *
 * Narrow on purpose. A network timeout and a plan cap both arrive as failures, but only
 * one of them means "do not call this again today", and treating a blip as a spent
 * provider would quietly shrink the rotation for the whole run.
 */
const isAllowanceError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);

  const lowered = message.toLowerCase();

  return [
    "exceeds your plan",
    "usage limit",
    "rate limit",
    "quota",
    "429",
    "resource_exhausted",
    "insufficient_quota",
    "too many requests",
  ].some((needle) => lowered.includes(needle));
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Maps whichever normaliser ran onto the one result shape.
 *
 * Reads each provider's normalised output loosely rather than asserting a type, because
 * the normalisers are typed against their own responses and this is the one place all
 * four shapes meet. A provider that adds a field later is picked up here rather than
 * needing the tool changed.
 */
const toWebSearchResponse = (
  provider: string,
  normalized: unknown,
): Pick<WebSearchResponse, "results" | "faq"> => {
  const record = (normalized ?? {}) as Record<string, unknown>;

  const rawResults = Array.isArray(record.results) ? record.results : [];

  const results: WebSearchResult[] = rawResults.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;

    // Three names for the same thing across the providers.
    const snippets = row.snippets ?? row.extraSnippets ?? row.highlights;

    return {
      title: text(row.title),
      description: text(row.description),
      snippets: Array.isArray(snippets)
        ? snippets.map(text).filter((value) => value.length > 0)
        : [],
      url: typeof row.url === "string" ? row.url : null,
    };
  });

  const rawFaq = Array.isArray(record.faq) ? record.faq : [];

  const faq = rawFaq.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;

    return { question: text(row.question), answer: text(row.answer) };
  });

  return { results, faq };
};

/**
 * Searches, moving down the provider order when one cannot answer.
 *
 * Two kinds of failure are treated differently on purpose. An allowance failure marks
 * that provider spent and the run stops calling it. Anything else - a timeout, a 500, a
 * network blip - moves to the next provider but leaves the failing one in the rotation,
 * because the next call may well succeed.
 *
 * Throws only when nothing can answer, and the message names every provider and why,
 * because "search failed" with no detail is what makes a quiet run look like a quiet
 * day.
 */
export const webSearch = async (
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
  signal?: AbortSignal,
): Promise<WebSearchResponse> => {
  const failed: { provider: SearchProviderName; error: string }[] = [];

  const tried: SearchProviderName[] = [];

  // Taken before the loop, so a provider marked spent *during* this call is not reported
  // as though it had been skipped in favour of the one that answered.
  const alreadySpent = [...exhausted];

  for (const name of SEARCH_PROVIDER_ORDER) {
    if (exhausted.has(name)) continue;

    const provider = searchProviders[name] as SearchProvider;

    tried.push(name);

    try {
      const raw = await provider.search(query, limit);

      const shaped = toWebSearchResponse(name, provider.normalize(raw as never));

      // Only worth a line when something actually went wrong first: a failover that is
      // invisible is a failover that changes results without anyone knowing.
      if (failed.length > 0 || alreadySpent.length > 0) {
        const bypassed = [...alreadySpent, ...failed.map((f) => f.provider)];

        console.log(
          `[websearch] "${query}" answered by ${name} after ${bypassed.join(", ")} did not`,
        );
      }

      return {
        provider: name,
        ...shaped,
        skipped: alreadySpent,
        failed,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      failed.push({ provider: name, error: message });

      if (isAllowanceError(error)) {
        exhausted.add(name);

        console.warn(
          `[websearch] ${name} is out of allowance and will not be called again in this ` +
            `process: ${message.slice(0, 140)}`,
        );
      }
    }
  }

  throw new Error(
    `Web search failed for "${query}". ` +
      (tried.length === 0
        ? `Every provider is out of allowance: ${exhausted.size > 0 ? [...exhausted].join(", ") : "none"}. `
        : `Tried ${tried.join(", ")}. `) +
      failed.map((f) => `${f.provider}: ${f.error.slice(0, 120)}`).join(" | "),
  );
};

export const webSearchTool = tool({
  description:
    "Search the public web for high-signal news and authoritative information. " +
    "Prioritize results from Reuters, Associated Press (AP), Bloomberg, and CoinDesk. " +
    "Prefer original reporting and primary sources over aggregators, reposts, SEO content, blogs, and low-quality crypto news sites. " +
    "Use this tool for broad discovery of important, breaking, emerging, or unexpected developments that may not appear in structured news feeds. " +
    "For general news, prioritize Reuters, AP, and Bloomberg; for crypto-specific news, prioritize Reuters, Bloomberg, AP, and CoinDesk. " +
    "When an official government, regulatory, company, or project source is the original source of an announcement, prefer that primary source when relevant. " +
    "Results are ranked web pages with titles and excerpts; excerpts are fragments, not full article summaries. " +
    "Several search providers back this tool, so a provider running out of allowance does not mean results stop.",

  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search for an important current development, event, or emerging story. " +
          "Use natural-language queries describing the topic, entity, market, or event you want to discover. " +
          "Favor queries that surface recent reporting from Reuters, AP, Bloomberg, or CoinDesk rather than generic web results. " +
          "For broad discovery, search for current developments rather than asking for explanations of a single known story.",
      ),

    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(DEFAULT_SEARCH_LIMIT)
      .describe(
        "Number of web results to request. Use enough results to discover high-signal reporting, but avoid excessive results when investigating a specific event.",
      ),
  }),

  execute: async ({ query, limit }, options) => await webSearch(query, limit, options.abortSignal),
});
