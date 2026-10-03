/**
 * Normalizer for FMP `fmp-articles` headlines.
 *
 * Projects the upstream record down to a list of headlines. That projection is
 * the whole point: the raw `content` field is the full article as HTML,
 * 1987-3599 characters per record, and it repeats its own bullet summary before
 * the body paragraphs. Across 40 records that is ~110k characters (~28k tokens)
 * of largely duplicated text, versus ~3.5k characters for the titles alone.
 *
 * Kept separate from the AI tool so the projection is reusable and testable
 * without instantiating the AI SDK, matching how `newsFlash` and `GDELT` are
 * organised.
 */

/** Agent-facing output: headlines only, no bodies. */
export type FmpArticleTitles = {
  count: number;
  titles: string[];
};

/**
 * Extracts headlines from raw FMP records.
 *
 * Records whose `title` is missing or blank are dropped rather than emitted as
 * empty strings, so `count` always reflects headlines that are actually usable.
 * Upstream ordering is preserved - FMP returns these newest first, and that
 * ordering is the signal.
 */
export const normalizeFmpArticleTitles = (
  records: Record<string, unknown>[],
): FmpArticleTitles => {
  const titles = records
    .map((record) => record.title)
    .filter(
      (title): title is string => typeof title === "string" && title.trim() !== "",
    )
    .map((title) => title.trim());

  return { count: titles.length, titles };
};