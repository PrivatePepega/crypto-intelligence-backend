import { fetchNews, readRecords, type FinnhubParams } from "./client.js";

/**
 * Normalizer for `GET /news?category=crypto`.
 *
 * Projects each article down to `headline` and `summary`.
 *
 * ## What the raw data actually looks like
 *
 * Measured 2026-10-04 on 89 records:
 *
 *  - `headline` is present on **every** record, 27-94 characters.
 *  - `summary` is present on only **56 of 89**. The other 33 arrive as an empty
 *    string, which is a real gap in the feed rather than malformed data - some
 *    publishers (CoinDesk, SeekingAlpha among them) supply no summary at all.
 *  - `summary` runs from 83 to **3577** characters, so it is a full article body
 *    for some sources and a one-liner for others.
 *  - Occasional HTML tags survive in `summary`.
 *
 * Articles with no summary are **kept**, with `summary` reported as `null`. The
 * headline still carries the signal, and dropping a third of the feed would cost
 * more than an empty field does. Dropping them is a one-line change here if
 * that trade is wrong.
 */

/** Maximum articles returned per call. */
export const CRYPTO_NEWS_LIMIT = 5;

export type NormalizedCryptoNewsItem = {
  headline: string;
  summary: string | null;
};

export type NormalizedCryptoNews = {
  count: number;
  items: NormalizedCryptoNewsItem[];
};

/** HTML entities that turn up inside summaries. */
const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
  "&amp;": "&",
};

/**
 * Cleans a summary: decodes entities, strips tags, collapses whitespace.
 *
 * Entities are decoded *before* tags are stripped, because some arrive already
 * escaped - stripping first would leave `&lt;p&gt;` behind as literal text.
 */
const cleanSummary = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const named = Object.entries(ENTITIES).reduce(
    (text, [entity, character]) => text.split(entity).join(character),
    value,
  );

  const decoded = named.replace(/&#(\d+);/g, (_, code: string) =>
    String.fromCharCode(Number(code)),
  );

  const stripped = decoded
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, " ");

  const cleaned = stripped
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return cleaned === "" ? null : cleaned;
};

/**
 * Projects a raw `/news?category=crypto` response down to headlines and
 * summaries.
 *
 * Accepts the raw array, or a wrapper carrying it under `response` - the
 * capture files use the latter, the live API returns the former.
 */
export const normalizeCryptoNews = (raw: unknown): NormalizedCryptoNews => {
  const payload =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? ((raw as { response?: unknown }).response ?? raw)
      : raw;

  const records = readRecords(payload);

  const items = records
    .map((record) => ({
      headline: typeof record.headline === "string" ? record.headline.trim() : "",
      summary: cleanSummary(record.summary),
    }))
    .filter((item) => item.headline !== "");

  return { count: items.length, items };
};

/**
 * Fetches crypto news and returns it normalized.
 *
 * One call, clean output. `limit` is passed to the API but note that **Finnhub
 * ignores it** - a request for 5 returned 89 records. The cap is therefore
 * applied here, client-side, rather than trusted from upstream.
 *
 * @param limit Articles to return. Defaults to {@link CRYPTO_NEWS_LIMIT}.
 */
export const getCryptoNews = async (options: {
  limit?: number;
  params?: FinnhubParams;
  signal?: AbortSignal | undefined;
} = {}): Promise<NormalizedCryptoNews> => {
  const limit = options.limit ?? CRYPTO_NEWS_LIMIT;

  const payload = await fetchNews(
    { category: "crypto", limit, ...options.params },
    options.signal,
  );

  return sliceNormalized(normalizeCryptoNews(payload), limit);
};

/** Trims a normalized result to `limit` records. */
export const sliceNormalized = (
  normalized: NormalizedCryptoNews,
  limit: number,
): NormalizedCryptoNews => ({
  count: Math.min(normalized.count, limit),
  items: normalized.items.slice(0, limit),
});