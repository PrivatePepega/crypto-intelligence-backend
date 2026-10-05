import { readArray, readGeneratedAt, type NewsMarketsSection } from "./client.js";

/**
 * Normalizer for `GET /data/v1/sections/{section}.json`.
 *
 * Projects each story down to `headline` and `summary`.
 *
 * ## One normalizer, four sections
 *
 * The four sections in scope - `ai`, `business`, `crypto`, `tech` - are the same
 * endpoint with a different path parameter, and their story objects are
 * identical. A single normalizer serves all four; the per-section fetchers in
 * `fetchers/` are thin wrappers that supply their own name.
 *
 * ## What the raw data actually looks like
 *
 * Measured 2026-10-04 on a single snapshot (`generated_at`
 * `2026-10-04T20:32:45.595801+00:00`), 70 stories across the four sections:
 *
 * | Section | Stories | `total` | Stories returned |
 * | --- | --- | --- | --- |
 * | `ai` | 3 | 3 | 3 |
 * | `business` | 40 | **42** | 40 |
 * | `crypto` | 4 | 4 | 4 |
 * | `tech` | 23 | 23 | 23 |
 *
 *  - `headline` is present on **every** story, 35-104 characters.
 *  - `summary` was present and non-empty on **all 70**, 84-215 characters.
 *  - **No HTML tags anywhere.** Unlike most providers here, the text arrives
 *    clean - no entity escaping, no markup, no stray newlines.
 *  - `summary` is a one- or two-sentence deck, not an article body. That is the
 *    opposite of Finnhub, where the same field runs to 3577 characters.
 *
 * `total` is the section's true story count and can exceed what is returned:
 * `business` reported **42** but the payload carries 40, the documented
 * per-section cap. Both counts are surfaced so a caller can tell "that is all
 * there is" from "that is all you get".
 *
 * ## Why `summary` is nullable anyway
 *
 * It was populated on all 70 stories, so a `string` type would be defensible
 * today. This is a snapshot republished on a schedule, not a feed with a
 * guaranteed schema - `summary` is exactly the kind of field publishers omit.
 * The type allows `null` so a later refresh cannot turn a missing deck into a
 * silently empty string. Tighten it once the shape has held across many
 * snapshots.
 */

/**
 * The server's per-section cap.
 *
 * Not a request parameter - the endpoint takes none. It is the ceiling on
 * `stories.length`, reached by `business`, `politics`, `sports` and `world` in
 * the capture.
 */
export const SECTION_STORIES_CAP = 40;

export type NormalizedSectionStory = {
  headline: string;
  summary: string | null;
};

export type NormalizedSectionNews = {
  section: NewsMarketsSection;
  /** True count for the section, which may exceed {@link count}. */
  total: number;
  /** Stories actually returned, after any limit was applied. */
  count: number;
  /**
   * When the server built this payload.
   *
   * Worth carrying: the endpoint is a static snapshot, so two calls minutes
   * apart can return identical data. `section-weather` in the discovery capture
   * was 5.5 hours stale relative to its siblings.
   */
  generatedAt: string | null;
  items: NormalizedSectionStory[];
};

/** The capture files wrap the payload as `{ response: ... }`; the live API does
 *  not. Accept either, plus a bare array, so normalizers can be pointed at
 *  either source. */
const unwrap = (raw: unknown): unknown =>
  raw && typeof raw === "object" && !Array.isArray(raw) && "response" in raw
    ? ((raw as { response: unknown }).response ?? raw)
    : raw;

/**
 * Collapses whitespace and trims.
 *
 * Deliberately minimal. The capture showed no HTML, no entities and no embedded
 * newlines, so there is nothing to strip - this only guards against a stray
 * space in a future snapshot. An empty result becomes `null` rather than `""`.
 */
const cleanText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();

  return cleaned === "" ? null : cleaned;
};

/**
 * Projects a raw section payload down to headlines and summaries.
 *
 * Applies no limit. Slicing is the caller's business, via
 * {@link sliceNormalized}.
 *
 * @param raw    Live payload, capture file, or bare story array.
 * @param section Section name, echoed back on the result for provenance.
 */
export const normalizeSectionNews = (
  raw: unknown,
  section: NewsMarketsSection,
): NormalizedSectionNews => {
  const payload = unwrap(raw);

  const stories = Array.isArray(payload)
    ? (payload as Record<string, unknown>[])
    : readArray<Record<string, unknown>>(payload, "stories");

  const items = stories
    .map((story) => ({
      headline: cleanText(story.headline) ?? "",
      summary: cleanText(story.summary),
    }))
    .filter((item) => item.headline !== "");

  const reportedTotal =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { total?: unknown }).total
      : undefined;

  return {
    section,
    total:
      typeof reportedTotal === "number" && Number.isFinite(reportedTotal)
        ? reportedTotal
        : items.length,
    count: items.length,
    generatedAt: readGeneratedAt(payload),
    items,
  };
};

/**
 * Trims a normalized result to `limit` stories, keeping `total` intact.
 *
 * A missing or non-numeric `limit` means **no trimming**, not zero stories.
 *
 * That case is not hypothetical. `Math.max(0, undefined)` is `NaN`, and
 * `items.slice(0, NaN)` is `[]` - so a caller reaching this function without a
 * limit silently got an empty result. In production the tool's Zod schema
 * supplies a default, which hides it; the qualifying round found it by calling
 * `execute` directly. Guarding here means the function is correct on its own
 * terms rather than depending on a caller having parsed a schema first.
 */
export const sliceNormalized = (
  normalized: NormalizedSectionNews,
  limit?: number,
): NormalizedSectionNews => {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return normalized;
  }

  const bounded = Math.max(0, Math.floor(limit));

  return {
    ...normalized,
    count: Math.min(normalized.count, bounded),
    items: normalized.items.slice(0, bounded),
  };
};