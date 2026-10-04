import { cleanText } from "./client.js";

/**
 * Normalizer for `GET /api/trending` - trending topics.
 *
 * Projects each trend down to `topic`, `sentiment` and `recentHeadlines`.
 *
 * ## A different shape entirely
 *
 * This endpoint returns no articles. Its payload is
 * `{ trending: [...], timeWindow, articlesAnalyzed, fetchedAt }`, so
 * `readArticles` finds nothing and the projection reads `trending` directly.
 */

/** Maximum trends returned per call. */
export const TRENDING_LIMIT = 5;

export type NormalizedTrendingItem = {
  topic: string;
  sentiment: string;
  recentHeadlines: string[];
};

export type NormalizedTrending = {
  count: number;
  items: NormalizedTrendingItem[];
};

/** Reads a possibly-absent property from an arbitrary value. */
const prop = <T>(value: unknown, key: string): T | undefined =>
  typeof value === "object" && value !== null
    ? ((value as Record<string, unknown>)[key] as T | undefined)
    : undefined;

/**
 * Projects a raw `/api/trending` response down to topic, sentiment and recent
 * headlines.
 *
 * `topic` is the trend's label and is the field that identifies it, so it leads
 * the item. `sentiment` arrives as a string (`"neutral"`, `"bullish"`) and is
 * passed through cleaned.
 *
 * `recentHeadlines` is an array of strings, cleaned individually with empty
 * entries dropped.
 *
 * Accepts a capture file (`{ response: { trending } }`), the raw payload
 * (`{ trending }`), or an already-extracted array.
 *
 * Trends with no topic or no sentiment are still returned rather than dropped,
 * because the headlines remain useful on their own.
 */
export const normalizeTrending = (raw: unknown): NormalizedTrending => {
  const payload =
    typeof raw === "object" && raw !== null
      ? (prop<unknown>(raw, "response") ?? raw)
      : raw;

  const trends = Array.isArray(payload)
    ? payload
    : ((prop<unknown>(payload, "trending") as unknown[]) ?? []);

  const items = (trends as Record<string, unknown>[])
    .slice(0, TRENDING_LIMIT)
    .map((trend) => {
      const headlines = Array.isArray(trend.recentHeadlines)
        ? trend.recentHeadlines
        : [];

      return {
        topic: cleanText(trend.topic),
        sentiment: cleanText(trend.sentiment),
        recentHeadlines: headlines
          .map((headline) => cleanText(headline))
          .filter((headline) => headline !== ""),
      };
    });

  return { count: items.length, items };
};