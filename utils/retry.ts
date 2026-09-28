// Generic retry helper for external API calls.
//
// Some upstream APIs intermittently return a rate-limit response or an empty
// payload even when the previous request was seconds earlier, so callers can
// wrap a fetch and treat both a thrown error and a judged-empty result as a
// reason to back off and try again.

export class EmptyResultError extends Error {
  constructor(label: string) {
    super(`${label} returned an empty result`);
    this.name = "EmptyResultError";
  }
}

export type RetryOptions<T> = {
  // Total attempts, including the first. Default 5.
  attempts?: number;
  // Fixed wait between attempts, in milliseconds. Default 5000.
  delayMs?: number;
  // Used in log output and in the thrown error.
  label?: string;
  // Return true when a successful response should still be retried, e.g. an
  // array with no entries.
  isEmptyResult?: (value: T) => boolean;
  // Set false to skip logging, for use inside tight loops.
  log?: boolean;
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const withRetry = async <T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions<T> = {},
): Promise<T> => {
  const attempts = options.attempts ?? 5;
  const delayMs = options.delayMs ?? 5000;
  const label = options.label ?? "operation";
  const shouldLog = options.log ?? true;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await operation(attempt);

      if (options.isEmptyResult?.(result)) {
        throw new EmptyResultError(label);
      }

      if (shouldLog && attempt > 1) {
        console.log(`✓ ${label} succeeded on attempt ${attempt}/${attempts}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === attempts;

      if (shouldLog) {
        const reason =
          error instanceof Error ? error.message : String(error);

        if (isLastAttempt) {
          console.error(
            `✗ ${label} failed after ${attempts} attempts: ${reason}`,
          );
        } else {
          console.warn(
            `↻ ${label} attempt ${attempt}/${attempts} failed (${reason}); retrying in ${delayMs}ms`,
          );
        }
      }

      if (isLastAttempt) {
        break;
      }

      await delay(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed after ${attempts} attempts`);
};
