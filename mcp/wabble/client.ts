import "dotenv/config";

/**
 * REST client for the Wabble News API.
 *
 * ## Endpoint
 *
 * ```
 * https://wabble.news/v1/news
 * ```
 *
 * ## Authentication
 *
 * `Authorization: Bearer <WABBLE_API_KEY>`. The key is read from the
 * environment and never returned, logged or included in an error message.
 */

/** Root of the API. Overridable for tests; the default is the live service. */
const getBaseUrl = (): string =>
  process.env.WABBLE_BASE_URL ?? "https://wabble.news";

/** The only endpoint this integration uses. */
const NEWS_PATH = "/v1/news";

/** The account's key, or an empty string when unconfigured. */
const getApiKey = (): string => process.env.WABBLE_API_KEY ?? "";

/**
 * Whether a key is present.
 *
 * Checked before any request. A missing key produces a 401 with a generic
 * message, so failing here gives a clearer error than letting the server
 * decide.
 */
export const isWabbleConfigured = (): boolean => getApiKey() !== "";

/** The path this client calls, for logging. Holds no secret. */
export const describeWabbleBaseUrl = (): string => `${getBaseUrl()}${NEWS_PATH}`;

/**
 * Importance levels.
 *
 * The API validates this server-side and is case-sensitive: `HIGH` is rejected
 * with
 *
 * ```
 * importance must contain high, medium or low (comma-separated for REST, an
 * array for WebSocket).
 * ```
 *
 * Comma-separated lists are accepted, e.g. `high,medium`.
 */
export const WABBLE_IMPORTANCE_LEVELS = ["high", "medium", "low"] as const;

export type WabbleImportance = (typeof WABBLE_IMPORTANCE_LEVELS)[number];

/**
 * Categories confirmed to exist.
 *
 * Split by how the API responds, which is the useful distinction:
 *
 *  - {@link WABBLE_ACCOUNT_CATEGORIES} - `400` is never returned for these.
 *  - {@link WABBLE_PLAN_GATED_CATEGORIES} - return `403`, meaning the name is
 *    valid but outside this account's plan.
 *
 * Anything not listed here returned `400`, so it is not a category name.
 *
 * ### The account is on the free plan
 *
 * The envelope reports `"plan":"free"` and the refusal is explicit:
 *
 * ```
 * This category is outside your account selection. Free includes one category;
 * Starter and above support all categories.
 * ```
 *
 * So `markets` is the only lane available without a plan change. This client
 * does not pretend otherwise - see {@link WABBLE_ACCOUNT_CATEGORIES}.
 */
export const WABBLE_ACCOUNT_CATEGORIES = ["markets"] as const;

export const WABBLE_PLAN_GATED_CATEGORIES = [
  "crypto",
  "stocks",
  "commodities",
] as const;

export type WabbleCategory =
  | (typeof WABBLE_ACCOUNT_CATEGORIES)[number]
  | (typeof WABBLE_PLAN_GATED_CATEGORIES)[number];

/** Largest `limit` the API accepts. `limit=500` is refused with a `400`. */
export const WABBLE_MAX_LIMIT = 100;

/** Smallest `limit` the API accepts. */
export const WABBLE_MIN_LIMIT = 1;

/**
 * The plan's stated minimum gap between requests, in seconds.
 *
 * Reported as `delay_seconds` in every response envelope. It is a **plan term,
 * not an enforced throttle** - roughly 26 requests fired 0.6-3s apart during
 * discovery returned `200` every time, with no `429` and no rate-limit header.
 *
 * It is recorded here because a plan upgrade may start enforcing it. Set
 * `WABBLE_GAP_MS=120000` in the discovery script to honour it exactly.
 */
export const WABBLE_ADVISED_DELAY_SECONDS = 120;

/** Query parameters accepted by `GET /v1/news`. */
export type WabbleNewsParams = {
  /**
   * Comma-separated category filter. Only `markets` is available on the free
   * plan; see {@link WABBLE_ACCOUNT_CATEGORIES}.
   */
  categories?: string;

  /** Importance filter. Comma-separated for several levels. */
  importance?: string;

  /** Free-text query. */
  q?: string;

  /** 1-100. Defaults to the API's own default when omitted. */
  limit?: number;

  /**
   * Keyset pagination cursor, taken from a previous response's `next_cursor`.
   *
   * Opaque - pass it back verbatim. Use
   * {@link decodeWabbleCursor} only to inspect it.
   */
  cursor?: string;

  /** BCP 47 language tag. The account is fixed to `en`. */
  language?: string;
};

/** Provenance block on an article. */
export type WabbleProvenance = {
  publisher: string | null;
  /** Which clock the timestamp came from, e.g. `wabble_channel`. */
  timestampBasis: string | null;
  /** `not_disclosed` in every capture so far - the upstream source is hidden. */
  upstreamSource: string | null;
};

/** Image licensing block. `commercialUse` was `null` in every capture. */
export type WabbleImageRights = {
  status: string | null;
  commercialUse: string | null;
};

/** A single article. Timestamps are epoch milliseconds, not ISO strings. */
export type WabbleNewsItem = {
  id: string;
  headline: string;
  /**
   * Short standfirst. **Frequently empty** - the first capture had `""` here,
   * so treat it as optional rather than guaranteed text.
   */
  excerpt: string;
  /** Epoch ms. Publisher's own time, when known. */
  publishedAt: number | null;
  /** Epoch ms. When Wabble first learned of the item. */
  detectedAt: number | null;
  /** Epoch ms. When the record last changed. */
  updatedAt: number | null;
  /** Epoch ms. When the item became retrievable. */
  availableAt: number | null;
  /** Publisher's timestamp, `null` when not disclosed. */
  sourcePublishedAt: number | null;
  provenance: WabbleProvenance | null;
  /**
   * **Relative path**, e.g. `/assets/news/<sha>.jpg`. Join with
   * {@link wabbleAbsoluteUrl} before use.
   */
  imageUrl: string | null;
  category: string | null;
  importance: WabbleImportance | null;
  /** Boolean mirror of `importance === "high"`. */
  important: boolean | null;
  imageRights: WabbleImageRights | null;
};

/** Archive/replay window, describing how far back the API can serve. */
export type WabbleArchive = {
  retentionDays: number | null;
  replayDays: number | null;
  /** Epoch ms of the oldest retrievable item. */
  earliest: number | null;
  /** Epoch ms of the newest retrievable item. */
  latest: number | null;
  /** Total items retrievable across the window, before filtering. */
  count: number | null;
};

/** Quota and plan state, reported on every successful response. */
export type WabbleQuota = {
  plan: string | null;
  /** Plan's stated minimum gap between requests, seconds. Not enforced. */
  delaySeconds: number | null;
  requestLimit: number | null;
  quotaPeriod: string | null;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  /** Requests left in the current period. */
  remaining: number | null;
  /** ISO timestamp of the next reset. */
  resetAt: string | null;
  /** False on the free plan - no scheduled market-calendar access. */
  calendarAccess: boolean | null;
  /** Categories this account may read. */
  newsCategories: string[];
  /** Whether the response is flagged stale by the server. */
  stale: boolean | null;
  /** ISO timestamp of when the snapshot the data came from was taken. */
  archive: WabbleArchive | null;
};

/** The full success envelope. */
export type WabbleNewsResponse = {
  ok: true;
  /** Echo of the API's own count for the returned page. */
  count: number;
  language: string | null;
  requestId: string | null;
  data: WabbleNewsItem[];
  /**
   * Opaque keyset cursor for the next page, or `null` at the end.
   *
   * Decodes to `{ signature, snapshot, at, id }`. `id` is the last item's id -
   * pagination is keyset-based, so pages do not shift or duplicate the way an
   * offset would.
   */
  nextCursor: string | null;
  quota: WabbleQuota;
};

/** Thrown for a failed request, with the upstream body preserved. */
export class WabbleApiError extends Error {
  readonly status: number;

  readonly code: string | null;

  readonly requestId: string | null;

  constructor(
    message: string,
    details: { status: number; code?: string | null; requestId?: string | null },
  ) {
    super(message);

    this.name = "WabbleApiError";
    this.status = details.status;
    this.code = details.code ?? null;
    this.requestId = details.requestId ?? null;
  }
}

/** Reads a property from an arbitrary value. */
const prop = <T>(value: unknown, key: string): T | undefined =>
  typeof value === "object" && value !== null
    ? ((value as Record<string, unknown>)[key] as T | undefined)
    : undefined;

/** Reads a string, or `null`. */
const readString = (value: unknown, key: string): string | null => {
  const found = prop<unknown>(value, key);

  return typeof found === "string" ? found : null;
};

/** Reads a finite number, or `null`. */
const readNumber = (value: unknown, key: string): number | null => {
  const found = prop<unknown>(value, key);

  return typeof found === "number" && Number.isFinite(found) ? found : null;
};

/** Reads a boolean, or `null`. */
const readBoolean = (value: unknown, key: string): boolean | null => {
  const found = prop<unknown>(value, key);

  return typeof found === "boolean" ? found : null;
};

/** Reads an object, or `null`. */
const readObject = <T>(value: unknown, key: string): T | null => {
  const found = prop<unknown>(value, key);

  return typeof found === "object" && found !== null && !Array.isArray(found)
    ? (found as T)
    : null;
};

/** Reads an array, or `[]`.
 *
 *  Deliberately separate from {@link readObject}, which returns `null` for an
 *  array on purpose - conflating the two is how a populated `data` field once
 *  normalized to an empty list while the envelope's `count` still read 5.
 */
const readArray = <T>(value: unknown, key: string): T[] => {
  const found = prop<unknown>(value, key);

  return Array.isArray(found) ? (found as T[]) : [];
};

/** Reads an array of strings, or `[]`. */
const readStringArray = (value: unknown, key: string): string[] => {
  const found = prop<unknown>(value, key);

  return Array.isArray(found)
    ? found.filter((entry): entry is string => typeof entry === "string")
    : [];
};

/** Narrows an arbitrary string to a known importance level. */
const readImportance = (value: unknown): WabbleImportance | null => {
  const found = prop<unknown>(value, "importance");

  return typeof found === "string" &&
    (WABBLE_IMPORTANCE_LEVELS as readonly string[]).includes(found)
    ? (found as WabbleImportance)
    : null;
};

/** Normalizes one raw article. */
export const normalizeNewsItem = (raw: unknown): WabbleNewsItem => ({
  id: readString(raw, "id") ?? "",
  headline: readString(raw, "headline") ?? "",
  excerpt: readString(raw, "excerpt") ?? "",
  publishedAt: readNumber(raw, "publishedAt"),
  sourcePublishedAt: readNumber(raw, "sourcePublishedAt"),
  provenance: readObject<WabbleProvenance>(raw, "provenance"),
  imageUrl: readString(raw, "imageUrl"),
  category: readString(raw, "category"),
  importance: readImportance(raw),
  important: readBoolean(raw, "important"),
  imageRights: readObject<WabbleImageRights>(raw, "imageRights"),
  detectedAt: readNumber(raw, "detectedAt"),
  updatedAt: readNumber(raw, "updatedAt"),
  availableAt: readNumber(raw, "availableAt"),
});

/**
 * Normalizes a response envelope.
 *
 * `items` are in the API's own order, which is most-recent-first by
 * `publishedAt`. That ordering is preserved rather than re-sorted, so what the
 * normalizer returns is what the API ranked first.
 */
export const normalizeNewsResponse = (raw: unknown): WabbleNewsResponse => {
  const data = readArray<unknown>(raw, "data").map((item) =>
    normalizeNewsItem(item),
  );

  const archive = readObject<Record<string, unknown>>(raw, "archive");

  return {
    ok: true,
    count: readNumber(raw, "count") ?? data.length,
    language: readString(raw, "language"),
    requestId: readString(raw, "request_id"),
    data,
    nextCursor: readString(raw, "next_cursor"),
    quota: {
      plan: readString(raw, "plan"),
      delaySeconds: readNumber(raw, "delay_seconds"),
      requestLimit: readNumber(raw, "request_limit"),
      quotaPeriod: readString(raw, "quota_period"),
      dailyLimit: readNumber(raw, "daily_limit"),
      weeklyLimit: readNumber(raw, "weekly_limit"),
      remaining: readNumber(raw, "remaining"),
      resetAt: readString(raw, "reset_at"),
      calendarAccess: readBoolean(raw, "calendar_access"),
      newsCategories: readStringArray(raw, "news_categories"),
      stale: readBoolean(raw, "stale"),
      archive: archive
        ? {
            retentionDays: readNumber(archive, "retention_days"),
            replayDays: readNumber(archive, "replay_days"),
            earliest: readNumber(archive, "earliest"),
            latest: readNumber(archive, "latest"),
            count: readNumber(archive, "count"),
          }
        : null,
    },
  };
};

/**
 * Resolves an item's `imageUrl` against the API root.
 *
 * The API returns a **relative path** (`/assets/news/<sha>.jpg`), which is not
 * usable as-is. Already-absolute URLs pass through unchanged.
 */
export const wabbleAbsoluteUrl = (imageUrl: string | null): string | null => {
  if (imageUrl === null || imageUrl === "") {
    return null;
  }

  return imageUrl.startsWith("http")
    ? imageUrl
    : `${getBaseUrl()}${imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`}`;
};

/** Decoded form of `next_cursor`. Diagnostic only - the value is opaque. */
export type WabbleDecodedCursor = {
  signature?: unknown;
  /** Epoch ms. The snapshot the page was served from. */
  snapshot?: unknown;
  /** Epoch ms. When the cursor was issued. */
  at?: unknown;
  /** The last item's id in the preceding page. */
  id?: unknown;
};

/**
 * Decodes `next_cursor` for inspection.
 *
 * It is base64 of a small JSON object. Never parse this to *build* a cursor -
 * pass the original string back instead, so an added field cannot silently
 * break pagination.
 */
export const decodeWabbleCursor = (
  cursor: string | null,
): WabbleDecodedCursor | null => {
  if (cursor === null || cursor === "") {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(cursor, "base64").toString("utf8"),
    ) as WabbleDecodedCursor;
  } catch {
    return null;
  }
};

/**
 * `GET /v1/news`
 *
 * @param params Query filters. Omitted keys are not sent.
 * @param signal Abort signal.
 */
export const fetchNews = async (
  params: WabbleNewsParams = {},
  signal?: AbortSignal,
): Promise<WabbleNewsResponse> => {
  const apiKey = getApiKey();

  if (apiKey === "") {
    throw new WabbleApiError(
      "WABBLE_API_KEY is not set - cannot call the Wabble News API.",
      { status: 0, code: "not_configured" },
    );
  }

  const url = new URL(`${getBaseUrl()}${NEWS_PATH}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    ...(signal ? { signal } : {}),
  });

  const text = await response.text();

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WabbleApiError(
      `Wabble ${NEWS_PATH} returned non-JSON (HTTP ${response.status}): ` +
        `${text.replace(/\s+/g, " ").slice(0, 200)}`,
      { status: response.status },
    );
  }

  const ok = readBoolean(parsed, "ok");

  // The API answers a category-plan refusal with `ok:false` **and** a non-2xx
  // status, so both are checked. Note that the error envelope reports
  // `code:"internal_error"` even for a 400 or 403 - the code is not
  // discriminative, so the message is what gets surfaced.
  if (!response.ok || ok === false) {
    throw new WabbleApiError(
      `Wabble ${NEWS_PATH} failed (HTTP ${response.status}): ` +
        `${readString(parsed, "error") ?? text.replace(/\s+/g, " ").slice(0, 200)}`,
      {
        status: response.status,
        code: readString(parsed, "code"),
        requestId: readString(parsed, "request_id"),
      },
    );
  }

  return normalizeNewsResponse(parsed);
};