/**
 * Minimum gap between outbound requests to cryptocurrency.cv.
 *
 * The agent triggers this provider hard enough to trip its rate limiter, which
 * escalates from `429 RATE_LIMIT_EXCEEDED` to a standing
 * `403 REPEAT_RATE_LIMIT_ABUSE` block. This gate keeps calls spaced out.
 *
 * Override with `CRYPTOCV_MIN_GAP_MS`.
 */
const MIN_GAP_MS = Number(process.env.CRYPTOCV_MIN_GAP_MS ?? 5000);

/**
 * Timestamp before which the next request must not be sent.
 *
 * Module-level, so every fetcher shares one schedule.
 */
let nextAllowedAt = 0;

/**
 * Waits until this fetcher's turn, then reserves the next slot.
 *
 * The slot is reserved **before** awaiting, not after. That ordering is the
 * whole point: if the reservation happened after the wait, two concurrent
 * callers would both read the same `nextAllowedAt`, both compute a zero wait,
 * and fire simultaneously - which is exactly the burst that causes the
 * throttling. Reserving first turns a `Promise.all` over several tools into a
 * spaced queue instead.
 *
 * Not applied to `semanticSearch.test.ts` or other probe scripts, which are
 * developer tools and manage their own pacing.
 */
export const awaitRateLimitSlot = async (): Promise<void> => {
  const now = Date.now();

  const waitFor = Math.max(0, nextAllowedAt - now);

  // Reserve before awaiting, so concurrent callers queue behind this one.
  nextAllowedAt = Math.max(now, nextAllowedAt) + MIN_GAP_MS;

  if (waitFor > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitFor));
  }
};

/** The configured gap, for diagnostics. */
export const rateLimitGapMs = (): number => MIN_GAP_MS;