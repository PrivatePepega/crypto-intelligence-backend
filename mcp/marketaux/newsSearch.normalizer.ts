import { callMcpTool } from "../client.js";

/**
 * Normalizer for the `marketaux_news_search` MCP tool.
 *
 * Projects each article down to `title`, `description` and `snippet`.
 *
 * ## `entities` is dropped on purpose
 *
 * Upstream, Marketaux identifies companies and assets in each article and
 * scores their sentiment:
 *
 * ```
 * entities: [
 *   { name: "Dr. Martens plc",      sentimentScore: 0.5719 },
 *   { name: "BERKSHIRE HATHAWAY",   sentimentScore: -0.1779 },
 * ]
 * ```
 *
 * That block is removed from the agent-facing payload. It was a large share of
 * the response for little interpretive value - the same sentiment is usually
 * implied by the headline, and a `-0.1779` on Berkshire tells an agent nothing
 * actionable about the article it is attached to.
 *
 * **The entity filters still work.** `sentiment_gte`, `sentiment_lte`,
 * `min_match_score`, `filter_entities` and `must_have_entities` are applied
 * upstream and are unaffected. This tool can filter on entity sentiment
 * without reporting the entities, which is unusual but is the requested shape.
 *
 * The MCP tool itself still emits `entities` for any other client that wants
 * them; only the AI-facing path goes through this normalizer. Reverting is a
 * one-line change here.
 */

/** One article, without entity data. */
export type NormalizedMarketauxArticle = {
  title: string;
  /** Marketaux's own summary. **Frequently truncated mid-word.** */
  description?: string | undefined;
  /** Matched article text. Present only when entity matching ran. */
  snippet?: string | undefined;
};

export type NormalizedMarketauxNews = {
  articles: NormalizedMarketauxArticle[];
};

const readString = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const found = (value as Record<string, unknown>)[key];

  return typeof found === "string" && found !== "" ? found : undefined;
};

/**
 * Projects a `marketaux_news_search` result down to its text fields.
 *
 * Accepts `{ articles: [...] }`, a bare array, or a capture wrapper carrying
 * either under `response`.
 *
 * Articles without a title are dropped - `title` is the only field Marketaux
 * guarantees, so without it there is nothing usable left.
 */
export const normalizeMarketauxNews = (
  raw: unknown,
): NormalizedMarketauxNews => {
  const unwrapped =
    raw && typeof raw === "object" && !Array.isArray(raw) && "response" in raw
      ? ((raw as { response: unknown }).response ?? raw)
      : raw;

  const container =
    unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped)
      ? (unwrapped as { articles?: unknown }).articles
      : unwrapped;

  const records = Array.isArray(container)
    ? (container as Record<string, unknown>[])
    : [];

  const articles = records
    .map((record) => ({
      title: readString(record, "title") ?? "",
      description: readString(record, "description"),
      snippet: readString(record, "snippet"),
    }))
    .filter((article) => article.title !== "");

  return { articles };
};

/**
 * Calls `marketaux_news_search` and returns the result normalized.
 *
 * `entities` is stripped. See the note at the top of this file.
 */
export const fetchMarketauxNews = async (
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<NormalizedMarketauxNews> => {
  const result = await callMcpTool("marketaux_news_search", input, signal);

  return normalizeMarketauxNews(result);
};