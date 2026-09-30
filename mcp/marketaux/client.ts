import type { NewsAllQuery, RawNewsPage } from "./types.js";

const DEFAULT_BASE_URL = "https://api.marketaux.com/v1";

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * A failure from the Marketaux API or the transport carrying the request.
 *
 * Messages are safe to hand back to a model: the API token is never part of
 * them.
 */
export class MarketauxApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MarketauxApiError";
  }
}

export interface MarketauxClientOptions {
  baseUrl?: string;
  timeoutMs?: number;

  /** Injectable for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Thin, typed wrapper over the Marketaux REST API.
 *
 * The API authenticates with an `api_token` query parameter, so every URL
 * built here contains the secret. Nothing in this class logs or embeds a
 * request URL in an error message.
 */
export class MarketauxClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly apiKey: string,
    options: MarketauxClientOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Runs a search against `GET /v1/news/all`.
   *
   * @param signal Aborted when the client cancels the tool call or the
   * connection drops. Combined with the client's own timeout.
   */
  async searchAllNews(
    query: NewsAllQuery,
    signal?: AbortSignal,
  ): Promise<RawNewsPage> {
    const url = this.buildUrl("/news/all", query);

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal
      ? AbortSignal.any([signal, timeout])
      : timeout;

    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        signal: combined,
        headers: {
          accept: "application/json",
        },
      });
    } catch (error) {
      if (timeout.aborted) {
        throw new MarketauxApiError(
          `Marketaux request timed out after ${this.timeoutMs}ms`,
        );
      }

      if (signal?.aborted) {
        throw new MarketauxApiError(
          "Marketaux request was cancelled",
        );
      }

      throw new MarketauxApiError(
        `Could not reach the Marketaux API: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!response.ok) {
      throw new MarketauxApiError(
        await describeFailure(response),
        response.status,
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new MarketauxApiError(
        "Marketaux returned a response that was not valid JSON",
        response.status,
      );
    }

    return normalisePage(payload);
  }

  private buildUrl(
    path: string,
    query: NewsAllQuery,
  ): URL {
    const url = new URL(path.replace(/^\/+/, ""), `${this.baseUrl}/`);

    url.searchParams.set("api_token", this.apiKey);

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;

      url.searchParams.set(key, String(value));
    }

    return url;
  }
}

/**
 * Turns an error response body into a message that names the fix.
 */
async function describeFailure(
  response: Response,
): Promise<string> {
  const fallback =
    `Marketaux request failed with HTTP ${response.status} ${response.statusText}`.trim();

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return fallback;
  }

  if (typeof body !== "object" || body === null) {
    return fallback;
  }

  const record = body as Record<string, unknown>;

  // Marketaux answers errors as { code, message, docs } on some routes and
  // { error } or { errors: [...] } on others.
  const message = firstString(
    record.message,
    record.error,
    record.detail,
  );

  const code = firstString(
    record.code,
    record.type,
  );

  const details = Array.isArray(record.errors)
    ? record.errors
        .map((entry) => firstString(entry))
        .filter(
          (entry): entry is string => Boolean(entry),
        )
    : [];

  const parts = [message, ...details].filter(
    (part): part is string => Boolean(part),
  );

  const summary =
    parts.length > 0
      ? parts.join("; ")
      : fallback;

  if (response.status === 401 || response.status === 403) {
    return (
      `Marketaux rejected the API token (HTTP ${response.status}). ` +
      `Check that MARKETAUX_API_KEY is set to a valid token. ` +
      summary
    );
  }

  if (response.status === 429) {
    return (
      `Marketaux rate limit reached (HTTP 429). ` +
      `Free plans allow 100 requests per day. ` +
      summary
    );
  }

  return code
    ? `${summary} (${code})`
    : summary;
}

/**
 * Returns the first non-empty string value.
 */
function firstString(
  ...values: unknown[]
): string | undefined {
  for (const value of values) {
    if (
      typeof value === "string" &&
      value.trim() !== ""
    ) {
      return value.trim();
    }
  }

  return undefined;
}

/**
 * The endpoint returns `{ meta, data }` with `data: []` on an empty result,
 * but the field is absent entirely on some error shapes. Guard every level
 * rather than trusting the docs.
 */
function normalisePage(
  payload: unknown,
): RawNewsPage {
  const record =
    (payload ?? {}) as Record<string, unknown>;

  const meta =
    (record.meta ?? {}) as Record<string, unknown>;

  const data =
    Array.isArray(record.data)
      ? record.data
      : [];

  return {
    meta: {
      found: toNumber(meta.found),
      returned: toNumber(
        meta.returned,
        data.length,
      ),
      limit: toNumber(meta.limit),
      page: toNumber(meta.page, 1),
    },
    data: data as RawNewsPage["data"],
  };
}

function toNumber(
  value: unknown,
  fallback = 0,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}