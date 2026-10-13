import type { RetryOptions } from "../../../utils/retry.js";
import { withRetry } from "../../../utils/retry.js";

// --------------------------------------------------
// Model call retry
// --------------------------------------------------
//
// Every model call in the weather pipeline goes through here.
//
// ## Why the SDK's own retry was not enough
//
// A provider returning `503 Service temporarily overloaded` mid-stream surfaced as a
// `StreamProviderError` with `isRetryable: true`, and the run carried on as though
// nothing had happened: the observer reported zero observations, the run finished
// cleanly, and the empty domain was indistinguishable from a day with no signals.
// A stream that has already started emitting cannot be transparently resumed, so
// nothing below the SDK can retry it either - the whole call has to be made again.
//
// ## Why the budget belongs to each agent
//
// "Temporarily overloaded" is a capacity signal, not a rate limit. Five seconds is
// what a rate limit needs; a provider shedding load usually needs minutes before the
// queue drains, and the failures arrive in clusters rather than one at a time. So the
// budget is not a constant here: each agent declares `RETRY_ATTEMPTS` and
// `RETRY_DELAY_MS` beside its other sliders, because how long an outage is worth
// waiting out is that agent's judgement and it changes as providers behave. The
// fallbacks below only stop a new call site from failing on the first error.
//
// ## Why a silent empty response counts as a failure
//
// `isEmptyResult` is the half that matters most. A provider under load can answer
// successfully with nothing, and an agent handed an empty prompt produces an empty
// artifact that then gets written, injected and reported as a clean run. Treating
// that as retryable is what stops an outage from being mistaken for a quiet day.
// --------------------------------------------------

/**
 * Fallback policy, used only when a caller does not name its own.
 *
 * Every agent in the weather pipeline declares its own at the top of its file, next
 * to the other sliders - see `RETRY_ATTEMPTS` in `AI/weather/observer/observer.ts`.
 * These exist so a new call site cannot accidentally inherit nothing and fail on the
 * first error, not as the policy anyone actually runs on.
 */
const FALLBACK_ATTEMPTS = 5;

/** Fallback wait between attempts, in milliseconds. */
const FALLBACK_DELAY_MS = 10_000;

/**
 * Runs one model call, retrying provider failures and empty responses.
 *
 * @param operation The call. Receives the attempt number, 1-based, for logging.
 * @param label Names the call in the retry lines, e.g. `observer (crypto)`.
 * @param options The caller's own policy, chiefly `attempts`, `delayMs` and
 *   `isEmptyResult`. Anything omitted falls back to the values above.
 */
export const withModelRetry = async <T>(
  operation: (attempt: number) => Promise<T>,
  label: string,
  options: Partial<RetryOptions<T>> = {},
): Promise<T> =>
  await withRetry(operation, {
    // Defaults that only apply when the caller says nothing. Every agent in the
    // weather pipeline passes its own, because how long an outage is worth waiting
    // out is that agent's judgement rather than the shared helper's - and the spread
    // below already lets a caller's `attempts` and `delayMs` win.
    attempts: FALLBACK_ATTEMPTS,
    delayMs: FALLBACK_DELAY_MS,
    label,
    ...options,
  });
