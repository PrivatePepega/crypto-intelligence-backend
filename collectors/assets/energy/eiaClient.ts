import "dotenv/config";

/**
 * U.S. Energy Information Administration (EIA) API v2 client.
 *
 * This is the single EIA client in the repository. It reuses the existing
 * `EIA_API_KEY` environment configuration; no second credential, base URL or
 * duplicate configuration is introduced.
 *
 * Live behavior verified on 2026-10-27 against `https://api.eia.gov/v2/`:
 *
 *   - Auth uses the documented `api_key` query parameter. A missing key returns
 *     HTTP 403 `API_KEY_MISSING`; an invalid key returns HTTP 403
 *     `API_KEY_INVALID`.
 *   - Error bodies are JSON but appear in two different shapes:
 *       `{ "error": { "code": "...", "message": "..." } }`  (auth)
 *       `{ "error": "text", "code": 400 }`                  (bad path)
 *   - An unknown series is **not** an error: HTTP 200 with `total: "0"` and an
 *     empty `data` array.
 *   - Responses are capped at 5,000 rows. Asking for more returns a
 *     `parameter out of range: length` warning and truncates, so long series
 *     must be paginated with `offset`.
 *   - A truncated response carries an `incomplete return` warning.
 *
 * The API key never appears in a log line, error message or persisted artifact:
 * every URL produced here is redacted.
 */

const DEFAULT_BASE_URL = "https://api.eia.gov/v2";
const DEFAULT_REQUESTS_PER_MINUTE = 60;
const DEFAULT_REQUEST_BUDGET = 200;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 20_000;

export type EiaFailureKind =
  | "missing_api_key"
  | "unauthorized"
  | "invalid_request"
  | "rate_limited"
  | "http_error"
  | "timeout"
  | "network"
  | "invalid_json"
  | "request_budget_exhausted";

export interface EiaFailureDetails {
  kind: EiaFailureKind;
  status: number | null;
  route: string;
  /** URL with the `api_key` query parameter replaced by `<redacted>`. */
  url: string;
  apiCode: string | null;
  apiMessage: string | null;
}

export class EiaRequestError extends Error {
  readonly kind: EiaFailureKind;
  readonly status: number | null;
  readonly route: string;
  readonly url: string;
  readonly apiCode: string | null;
  readonly apiMessage: string | null;

  constructor(message: string, details: EiaFailureDetails) {
    super(message);
    this.name = "EiaRequestError";
    this.kind = details.kind;
    this.status = details.status;
    this.route = details.route;
    this.url = details.url;
    this.apiCode = details.apiCode;
    this.apiMessage = details.apiMessage;
  }
}

let requestsPerMinute = readPositiveNumber(
  process.env.EIA_REQUESTS_PER_MINUTE,
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

export function setEiaRequestsPerMinute(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid EIA request rate: ${value}`);
  }
  requestsPerMinute = value;
}

/** Caps HTTP attempts for this process so a runaway pull cannot burn the quota. */
export function setEiaRequestBudget(limit: number): void {
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit)) {
    throw new Error(`Invalid EIA request budget: ${limit}`);
  }
  requestBudget = limit;
}

export function getEiaRequestUsage(): { used: number; budget: number } {
  return { used: requestsUsed, budget: requestBudget };
}

export function resetEiaRequestUsage(budget = requestBudget): void {
  requestsUsed = 0;
  requestBudget = budget;
}

function getApiKey(): string {
  const key = process.env.EIA_API_KEY?.trim();
  if (!key) {
    throw new EiaRequestError(
      "EIA_API_KEY is not set; refusing to issue an unauthenticated request.",
      {
        kind: "missing_api_key",
        status: null,
        route: "(none)",
        url: "(none)",
        apiCode: null,
        apiMessage: null,
      },
    );
  }
  return key;
}

function getBaseUrl(): string {
  const configured = process.env.EIA_BASE_URL?.trim();
  const base = configured && configured !== "" ? configured : DEFAULT_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`Invalid EIA_BASE_URL: ${base}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid EIA_BASE_URL protocol: ${parsed.protocol}`);
  }

  return base.replace(/\/+$/, "");
}

/** Removes the API key from a URL so it can be logged or persisted. */
export function redactEiaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("api_key")) {
      return parsed.toString();
    }
    // Replace the value after parsing rather than via `searchParams.set`, which
    // would percent-encode the placeholder into `%3Credacted%3E`.
    return parsed.toString().replace(/([?&]api_key=)[^&]*/i, "$1<redacted>");
  } catch {
    return "(unparseable url)";
  }
}

export function classifyEiaStatus(status: number): EiaFailureKind | null {
  if (status >= 200 && status < 300) {
    return null;
  }
  if (status === 401 || status === 403) {
    return "unauthorized";
  }
  if (status === 400 || status === 404) {
    return "invalid_request";
  }
  if (status === 429) {
    return "rate_limited";
  }
  return "http_error";
}

export function isRetryableEiaFailure(kind: EiaFailureKind, status: number | null): boolean {
  if (kind === "rate_limited" || kind === "timeout" || kind === "network") {
    return true;
  }
  return kind === "http_error" && status !== null && status >= 500;
}

export interface EiaErrorBody {
  code: string | null;
  message: string | null;
}

/**
 * Reads either provider error shape.
 *
 * Auth failures nest an object; route failures use a bare string.
 */
export function readEiaError(bodyText: string): EiaErrorBody {
  const trimmed = bodyText.trim();
  if (trimmed === "") {
    return { code: null, message: null };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const error = record["error"];

      if (typeof error === "string") {
        const code = record["code"];
        return {
          code: typeof code === "string" || typeof code === "number" ? String(code) : null,
          message: error.trim().slice(0, 500),
        };
      }

      if (error && typeof error === "object" && !Array.isArray(error)) {
        const nested = error as Record<string, unknown>;
        const code = nested["code"];
        const message = nested["message"];
        return {
          code: typeof code === "string" || typeof code === "number" ? String(code) : null,
          message:
            typeof message === "string" && message.trim() !== ""
              ? message.trim().slice(0, 500)
              : null,
        };
      }
    }
  } catch {
    // Falls through to the raw text.
  }

  return { code: null, message: trimmed.replace(/\s+/g, " ").slice(0, 500) };
}

/** Extracts provider warnings from a successful response body. */
export function readEiaWarnings(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const warnings = (raw as Record<string, unknown>)["warnings"];
  if (!Array.isArray(warnings)) {
    return [];
  }

  const messages: string[] = [];
  for (const entry of warnings) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const warning = record["warning"];
    const description = record["description"];
    const text =
      typeof warning === "string" && typeof description === "string"
        ? `${warning}: ${description}`
        : typeof warning === "string"
          ? warning
          : typeof description === "string"
            ? description
            : null;
    if (text !== null) {
      messages.push(text.slice(0, 500));
    }
  }

  return messages;
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

export type EiaQueryParams = Record<string, string | string[] | undefined>;

export interface EiaFetchResult {
  /** Parsed JSON body. Shape validation is the caller's responsibility. */
  data: unknown;
  status: number;
  /** URL with the API key redacted. */
  url: string;
  route: string;
}

function buildUrl(route: string, params: EiaQueryParams, apiKey: string): URL {
  const base = getBaseUrl();
  const url = new URL(`${base}/${route.replace(/^\/+|\/+$/g, "")}/data/`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        url.searchParams.append(key, entry);
      }
    } else {
      url.searchParams.append(key, value);
    }
  }

  url.searchParams.set("api_key", apiKey);
  return url;
}

/**
 * Performs one logical EIA data query with rate limiting and bounded retries.
 *
 * Throws {@link EiaRequestError} with a classified `kind` on failure. An empty
 * `data` array is a successful result and is never turned into an error here.
 */
export async function eiaGet(
  route: string,
  params: EiaQueryParams = {},
  label = route,
): Promise<EiaFetchResult> {
  const apiKey = getApiKey();
  const url = buildUrl(route, params, apiKey);
  const redactedUrl = redactEiaUrl(url.toString());
  let lastError: EiaRequestError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (requestsUsed >= requestBudget) {
      throw new EiaRequestError(
        `EIA request budget exhausted (${requestBudget} attempts) before ${label}.`,
        {
          kind: "request_budget_exhausted",
          status: null,
          route,
          url: redactedUrl,
          apiCode: null,
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
      const kind: EiaFailureKind = isTimeout ? "timeout" : "network";
      lastError = new EiaRequestError(
        `EIA ${label} failed: ${isTimeout ? "request timed out" : "network error"} (${redactedUrl}).`,
        { kind, status: null, route, url: redactedUrl, apiCode: null, apiMessage: null },
      );

      if (attempt === MAX_ATTEMPTS - 1) {
        break;
      }
      await sleep(retryDelayMs(attempt));
      continue;
    }

    const bodyText = await response.text();
    const failureKind = classifyEiaStatus(response.status);

    if (failureKind === null) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText) as unknown;
      } catch {
        throw new EiaRequestError(
          `EIA ${label} returned a non-JSON success body (HTTP ${response.status}, ${redactedUrl}).`,
          {
            kind: "invalid_json",
            status: response.status,
            route,
            url: redactedUrl,
            apiCode: null,
            apiMessage: bodyText.slice(0, 200),
          },
        );
      }

      return { data: parsed, status: response.status, url: redactedUrl, route };
    }

    const errorBody = readEiaError(bodyText);
    lastError = new EiaRequestError(
      `EIA ${label} failed: HTTP ${response.status}` +
        (errorBody.code ? ` ${errorBody.code}` : "") +
        (errorBody.message ? ` - ${errorBody.message}` : "") +
        ` (${redactedUrl}).`,
      {
        kind: failureKind,
        status: response.status,
        route,
        url: redactedUrl,
        apiCode: errorBody.code,
        apiMessage: errorBody.message,
      },
    );

    if (!isRetryableEiaFailure(failureKind, response.status)) {
      throw lastError;
    }

    if (attempt === MAX_ATTEMPTS - 1) {
      break;
    }

    const delay = readRetryAfterMs(response) ?? retryDelayMs(attempt);
    console.warn(
      `  ! EIA ${label} ${failureKind} (HTTP ${response.status}); retrying in ${Math.round(
        delay / 1_000,
      )}s`,
    );
    await sleep(delay);
  }

  throw (
    lastError ??
    new EiaRequestError(`EIA ${label} failed after ${MAX_ATTEMPTS} attempts.`, {
      kind: "network",
      status: null,
      route,
      url: redactedUrl,
      apiCode: null,
      apiMessage: null,
    })
  );
}
