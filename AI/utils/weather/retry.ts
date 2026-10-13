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
// ## Why the delay is long
//
// "Temporarily overloaded" is a capacity signal, not a rate limit. Five seconds is
// what a rate limit needs; a provider shedding load usually needs more like a minute
// before the queue drains. Five attempts at ten seconds is about forty seconds of
// waiting before a domain is abandoned, which is roughly a minute end to end once
// the calls themselves are counted.
//
// ## Why a silent empty response counts as a failure
//
// `isEmptyResult` is the half that matters most. A provider under load can answer
// successfully with nothing, and an agent handed an empty prompt produces an empty
// artifact that then gets written, injected and reported as a clean run. Treating
// that as retryable is what stops an outage from being mistaken for a quiet day.
// --------------------------------------------------

/**
 * Total attempts per model call, including the first.
 *
 * Five, matching the shared helper's default rather than restating a different
 * number in four agents.
 */
const ATTEMPTS = 5;

/** Wait between attempts, in milliseconds. */
const DELAY_MS = 10_000;

/**
 * Whether a successful response is actually unusable.
 *
 * Empty or whitespace-only only. Anything else is a real answer, including a short
 * one - a provider that legitimately returns a two-line response has not failed, and
 * retrying it would burn four more calls to get the same thing.
 */
const isBlank = (text: string): boolean => text.trim().length === 0;

/**
 * Runs one model call, retrying provider failures and empty responses.
 *
 * @param operation The call. Receives the attempt number, 1-based, for logging.
 * @param label Names the call in the retry lines, e.g. `observer (crypto)`.
 * @param options The shared policy, overridable per call.
 */
export const withModelRetry = async <T>(
  operation: (attempt: number) => Promise<T>,
  label: string,
  options: Partial<RetryOptions<T>> = {},
): Promise<T> =>
  await withRetry(operation, {
    attempts: ATTEMPTS,
    delayMs: DELAY_MS,
    label,
    ...options,
  });
