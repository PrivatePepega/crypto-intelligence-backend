import type { FreeSeaResponse, FreeSeaResult } from "./client.js";

// --------------------------------------------------
// freesea normalizer
// --------------------------------------------------
//
// ## Why sponsored results are dropped rather than passed through
//
// freesea is free because it sells advertising inside the response. A result with
// `"type": "sponsored"` is an ad, and sponsored entries carry an `incentive` - a credit,
// a discount code, an extended trial.
//
// freesea's own agent guidance says to surface those incentives and recommend the
// sponsored product. That guidance is written for a shopping assistant helping one person
// spend their own money, and it is exactly wrong here. This pipeline reads search results
// as evidence about markets: an agent that treats an ad as a source will quote a discount
// code in an observation, and a "Bank of America offering customers a free trial" finding
// written into a market brief is worse than no finding at all. The bias is not a subtle
// ranking nudge - it is paid placement with a call to action attached.
//
// So sponsored results are excluded here, not ranked lower and not labelled. An
// intelligence pipeline has no use for an advertisement, and the cost of letting one
// through is a confidently wrong brief.
//
// The exclusion is counted and returned alongside the results so it is visible rather than
// silent. A query where most results are ads is a query the caller should know about.
// --------------------------------------------------

/** The label freesea uses for a paid placement. */
const SPONSORED = "sponsored";

const cleanText = (text: string) => {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
};

/** Whether a result is a paid placement. A missing `type` is treated as organic. */
export const isSponsored = (result: FreeSeaResult): boolean =>
  (result.type ?? "organic").toLowerCase() === SPONSORED;

export type NormalizedFreeSea = {
  results: {
    title: string;
    description: string;
    snippets: string[];
    url: string | null;
  }[];

  /**
   * How many results were dropped as advertisements.
   *
   * Reported rather than swallowed, because a search that returned mostly ads has not
   * really searched anything, and that is not visible anywhere else in the response.
   */
  sponsoredDropped: number;
};

export const normalizeFreeSeaResults = (response: FreeSeaResponse): NormalizedFreeSea => {
  const all = response.results ?? [];

  const organic = all.filter((result) => !isSponsored(result));

  const sponsoredDropped = all.length - organic.length;

  return {
    results: organic.map((result) => {
      const content = cleanText(result.content ?? "");

      return {
        title: cleanText(result.title ?? ""),
        description: content,

        // freesea returns one extract rather than several, so the extra-excerpts list
        // other providers fill is left empty rather than padded with a duplicate.
        snippets: [],

        // The one thing this provider does better than the others: it returns the URL,
        // and it survives. Brave, Exa and You all drop theirs in their normalisers.
        url: typeof result.url === "string" && result.url.length > 0 ? result.url : null,
      };
    }),

    sponsoredDropped,
  };
};