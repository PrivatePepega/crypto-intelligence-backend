import "dotenv/config";

const FREESEA_API_KEY = process.env.FREESEA_API_KEY;

if (!FREESEA_API_KEY) {
  throw new Error("FREESEA_API_KEY is not configured.");
}

const FREESEA_SEARCH_URL = "https://freesea.dev/v1/search";

/**
 * One result as freesea returns it.
 *
 * `type` is the field this whole file exists to read. A result with `type:
 * "sponsored"` is an advertisement, and sponsored entries carry an `incentive` - a
 * credit, a discount code, an extended trial. Both fields are declared because the
 * normaliser needs to be able to see them in order to exclude them.
 */
export type FreeSeaResult = {
  title?: string;
  url?: string;
  domain?: string;

  /**
   * The page's extract, in prose.
   *
   * A single field rather than the title-plus-snippet pairs the other providers give,
   * which is why it is longer than a typical `description`.
   */
  content?: string;

  /** Rank, 1-based. */
  position?: number;

  /** `"organic"` or `"sponsored"`. Absent on some responses, treated as organic. */
  type?: string;

  /** The commercial offer attached to a sponsored result. Never read by this pipeline. */
  incentive?: string;
};

export type FreeSeaResponse = {
  results?: FreeSeaResult[];
};

/** The page's own documented ceiling, above which the request is rejected rather than clamped. */
export const FREESEA_MAX_RESULTS = 20;

/**
 * Searches freesea.
 *
 * Raw request and raw response, with no interpretation. Normalising is the normaliser's
 * job, and keeping the two apart is what lets the sponsored-result question be answered
 * in one place rather than at every call site.
 *
 * `max_results` is clamped to the provider's own 1-20 range rather than passed through,
 * because a caller asking for 30 - which {@link DEFAULT_SEARCH_LIMIT} defaults to -
 * would otherwise get a 422 from an endpoint that would happily have returned 20.
 */
export const searchFreeSea = async (query: string, maxResults: number): Promise<FreeSeaResponse> => {
  const clamped = Math.max(1, Math.min(FREESEA_MAX_RESULTS, Math.trunc(maxResults)));

  const response = await fetch(FREESEA_SEARCH_URL, {
    method: "POST",

    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${FREESEA_API_KEY}`,
    },

    body: JSON.stringify({ query, max_results: clamped }),
  });

  if (!response.ok) {
    const body = await response.text();

    // 403 means the account is suspended. Named separately because the retry
    // behaviour has to differ: retrying a suspended account for eight minutes turns a
    // clear refusal into a slow one.
    const kind =
      response.status === 403
        ? "freesea account is suspended"
        : response.status === 429
          ? "freesea rate limit reached (Retry-After applies)"
          : `freesea API error`;

    throw new Error(`${kind} (${response.status}): ${body}`);
  }

  return (await response.json()) as FreeSeaResponse;
};