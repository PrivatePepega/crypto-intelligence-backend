import "dotenv/config";

/**
 * Minimal Financial Modeling Prep (FMP) HTTP client.
 *
 * Only what the commodity collector needs: API-key handling, a shared request
 * rate, a per-run request budget, bounded retries, and a precise classification
 * of provider failures.
 *
 * Provider behavior observed on 2026-10-27 with the configured account:
 *
 *   - Application errors are plain text, not JSON, even though `accept:
 *     application/json` is sent.
 *   - `402` means "not available under your current subscription". FMP uses it
 *     both for a restricted endpoint and for a restricted/unknown symbol, so it
 *     must never be read as "no data exists".
 *   - `401`/`403` mean the key is missing, invalid or lacks access.
 *   - `429` is the rate limit and is retryable.
 *   - `5xx` is retryable.
 *   - Success is a JSON array; an empty array is a valid empty result.
 *
 * The API key is never logged, never embedded in a returned error message and
 * never persisted. URLs exposed by this module are redacted.
 */

const DEFAULT_BASE_URL = "https://financialmodelingprep.com/stable";
const DEFAULT_REQUESTS_PER_MINUTE = 120;
const DEFAULT_REQUEST_BUDGET = 100;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 20_000;

export type FmpFailureKind =
  | "missing_api_key"
  | "restricted"
  | "unauthorized"
  | "rate_limited"
  | "http_error"
  | "timeout"
  | "network"
  | "invalid_json"
  | "request_budget_exhausted";

export interface FmpFailureDetails {
  kind: FmpFailureKind;
  status: number | null;
  endpoint: string;
  /** URL with the `apikey` query parameter replaced by `<redacted>`. */
  url: string;
  apiMessage: string | null;
}

/** A classified FMP failure. Messages are safe to log. */
export class FmpRequestError extends Error {
  readonly kind: FmpFailureKind;
  readonly status: number | null;
  readonly endpoint: string;
  readonly url: string;
  readonly apiMessage: string | null;

  constructor(message: string, details: FmpFailureDetails) {
    super(message);
    this.name = "FmpRequestError";
    this.kind = details.kind;
    this.status = details.status;
    this.endpoint = details.endpoint;
    this.url = details.url;
    this.apiMessage = details.apiMessage;
  }
}

let requestsPerMinute = readPositiveNumber(
  process.env.FMP_REQUESTS_PER_MINUTE,
  DEFAULT_REQUESTS_PER_MINUTE,
);
let requestBudget = DEFAULT_REQUEST_BUDGET;
let requestsUsed = 0;
let lastRequestStartedAt = 0;

function readPositiveNumber(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sets the per-process request rate. FMP enforces limits per minute. */
export function setFmpRequestsPerMinute(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid FMP request rate: ${value}`);
  }
  requestsPerMinute = value;
}

/**
 * Caps the number of HTTP attempts for this process.
 *
 * FMP plans have a daily quota, so a runaway backfill must fail closed instead
 * of silently exhausting the account.
 */
export function setFmpRequestBudget(limit: number): void {
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit)) {
    throw new Error(`Invalid FMP request budget: ${limit}`);
  }
  requestBudget = limit;
}

export function getFmpRequestUsage(): { used: number; budget: number } {
  return { used: requestsUsed, budget: requestBudget };
}

export function resetFmpRequestUsage(budget = requestBudget): void {
  requestsUsed = 0;
  requestBudget = budget;
}

function getApiKey(): string {
  const key = process.env.FMP_API_KEY?.trim();
  if (!key) {
    throw new FmpRequestError(
      "FMP_API_KEY is not set; refusing to issue an unauthenticated request.",
      {
        kind: "missing_api_key",
        status: null,
        endpoint: "(none)",
        url: "(none)",
        apiMessage: null,
      },
    );
  }
  return key;
}

function getBaseUrl(): string {
  const configured = process.env.FMP_BASE_URL?.trim();
  const base = configured && configured !== "" ? configured : DEFAULT_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`Invalid FMP_BASE_URL: ${base}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid FMP_BASE_URL protocol: ${parsed.protocol}`);
  }

  return base.replace(/\/+$/, "");
}

/** Removes the API key from a URL so it can be logged or persisted. */
export function redactFmpUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("apikey")) {
      parsed.searchParams.set("apikey", "<redacted>");
    }
    return parsed.toString();
  } catch {
    return "(unparseable url)";
  }
}

/** Maps an HTTP status to a failure kind, or `null` for success. */
export function classifyFmpStatus(status: number): FmpFailureKind | null {
  if (status >= 200 && status < 300) {
    return null;
  }
  if (status === 402) {
    return "restricted";
  }
  if (status === 401 || status === 403) {
    return "unauthorized";
  }
  if (status === 429) {
    return "rate_limited";
  }
  return "http_error";
}

export function isRetryableFmpFailure(kind: FmpFailureKind, status: number | null): boolean {
  if (kind === "rate_limited" || kind === "timeout" || kind === "network") {
    return true;
  }
  return kind === "http_error" && status !== null && status >= 500;
}

/**
 * Extracts a human-readable provider message from an error body.
 *
 * FMP returns plain text for errors. JSON error bodies are tolerated in case the
 * provider changes shape.
 */
export function readFmpErrorMessage(bodyText: string): string | null {
  const trimmed = bodyText.trim();
  if (trimmed === "") {
    return null;
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        for (const key of ["Error Message", "message", "error", "Error"]) {
          const value = record[key];
          if (typeof value === "string" && value.trim() !== "") {
            return value.trim().slice(0, 500);
          }
        }
      }
    } catch {
      // Falls through to the raw text.
    }
  }

  return trimmed.replace(/\s+/g, " ").slice(0, 500);
}

function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
}

function readRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) {
    return null;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, RETRY_MAX_DELAY_MS);
  }

  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(0, date - Date.now()), RETRY_MAX_DELAY_MS);
  }

  return null;
}

async function waitForRateLimit(): Promise<void> {
  const minimumGapMs = Math.ceil(60_000 / requestsPerMinute);
  const waitMs = lastRequestStartedAt + minimumGapMs - Date.now();

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastRequestStartedAt = Date.now();
}

export interface FmpFetchResult {
  /** Parsed JSON body. Shape validation is the caller's responsibility. */
  data: unknown;
  status: number;
  /** URL with the API key redacted. */
  url: string;
  endpoint: string;
}

/**
 * Performs one logical FMP GET with rate limiting and bounded retries.
 *
 * Throws {@link FmpRequestError} with a classified `kind` on failure. Callers
 * must distinguish `restricted` (plan limitation) from an empty result.
 */
export async function fmpGet(
  endpoint: string,
  params: Record<string, string> = {},
  label = endpoint,
): Promise<FmpFetchResult> {
  const apiKey = getApiKey();
  const base = getBaseUrl();

  const url = new URL(`${base}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("apikey", apiKey);

  const redactedUrl = redactFmpUrl(url.toString());
  let lastError: FmpRequestError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (requestsUsed >= requestBudget) {
      throw new FmpRequestError(
        `FMP request budget exhausted (${requestBudget} attempts) before ${label}.`,
        {
          kind: "request_budget_exhausted",
          status: null,
          endpoint,
          url: redactedUrl,
          apiMessage: null,
        },
      );
    }

    await waitForRateLimit();
    requestsUsed += 1;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const kind: FmpFailureKind = isTimeout ? "timeout" : "network";
      lastError = new FmpRequestError(
        `FMP ${label} failed: ${isTimeout ? "request timed out" : "network error"} (${redactedUrl}).`,
        { kind, status: null, endpoint, url: redactedUrl, apiMessage: null },
      );

      if (attempt === MAX_ATTEMPTS - 1) {
        break;
      }
      await sleep(retryDelayMs(attempt));
      continue;
    }

    const bodyText = await response.text();
    const failureKind = classifyFmpStatus(response.status);

    if (failureKind === null) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText) as unknown;
      } catch {
        throw new FmpRequestError(
          `FMP ${label} returned a non-JSON success body (HTTP ${response.status}, ${redactedUrl}).`,
          {
            kind: "invalid_json",
            status: response.status,
            endpoint,
            url: redactedUrl,
            apiMessage: readFmpErrorMessage(bodyText),
          },
        );
      }

      return {
        data: parsed,
        status: response.status,
        url: redactedUrl,
        endpoint,
      };
    }

    const apiMessage = readFmpErrorMessage(bodyText);
    lastError = new FmpRequestError(
      `FMP ${label} failed: HTTP ${response.status}` +
        (apiMessage ? ` - ${apiMessage}` : "") +
        ` (${redactedUrl}).`,
      {
        kind: failureKind,
        status: response.status,
        endpoint,
        url: redactedUrl,
        apiMessage,
      },
    );

    if (!isRetryableFmpFailure(failureKind, response.status)) {
      throw lastError;
    }

    if (attempt === MAX_ATTEMPTS - 1) {
      break;
    }

    const delay = readRetryAfterMs(response) ?? retryDelayMs(attempt);
    console.warn(
      `  ! FMP ${label} ${failureKind} (HTTP ${response.status}); retrying in ${Math.round(
        delay / 1_000,
      )}s`,
    );
    await sleep(delay);
  }

  throw (
    lastError ??
    new FmpRequestError(`FMP ${label} failed after ${MAX_ATTEMPTS} attempts.`, {
      kind: "network",
      status: null,
      endpoint,
      url: redactedUrl,
      apiMessage: null,
    })
  );
}
