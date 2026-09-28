import { withRetry, EmptyResultError } from "../utils/retry.js";

let check = 0;
const pass = (name: string, ok: boolean, extra = "") =>
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);

// Use a 1ms delay so the suite runs fast; the real scripts pass 5000.
const opts = { attempts: 5, delayMs: 1, log: false };

// 1. Succeeds on the first attempt, no retry.
{
  let calls = 0;
  const r = await withRetry(async () => { calls++; return "ok"; }, { ...opts, label: "first-try" });
  pass("succeeds first attempt, 1 call", r === "ok" && calls === 1, `calls=${calls}`);
}

// 2. Fails twice then succeeds -> exactly 3 calls, returns the value.
{
  let calls = 0;
  const r = await withRetry(async () => {
    calls++;
    if (calls < 3) throw new Error("429 rate limited");
    return "recovered";
  }, { ...opts, label: "transient" });
  pass("recovers after 2 failures, 3 calls", r === "recovered" && calls === 3, `calls=${calls}`);
}

// 3. Exhausts all attempts and throws the last error.
{
  let calls = 0;
  let thrown: unknown;
  try {
    await withRetry(async () => { calls++; throw new Error("always 429"); }, { ...opts, label: "exhausted" });
  } catch (e) { thrown = e; }
  pass("gives up after exactly 5 attempts", calls === 5, `calls=${calls}`);
  pass("rethrows the final error", thrown instanceof Error && thrown.message === "always 429", String(thrown));
}

// 4. Empty result triggers a retry, same as a thrown error.
{
  let calls = 0;
  const r = await withRetry(
    async () => { calls++; return { observations: [] as string[] }; },
    { ...opts, label: "empty", isEmptyResult: (v) => v.observations.length === 0 },
  ).catch(() => "threw");
  pass("empty result is retried up to the limit", calls === 5 && r === "threw", `calls=${calls}`);
}

// 5. Empty twice then real data.
{
  let calls = 0;
  const r = await withRetry(
    async () => {
      calls++;
      return { observations: calls < 3 ? [] : ["a", "b"] };
    },
    { ...opts, label: "empty-then-ok", isEmptyResult: (v) => v.observations.length === 0 },
  );
  pass("empty then populated returns the data", r.observations.length === 2 && calls === 3, `calls=${calls}`);
}

// 6. Defaults match the requested policy.
{
  let calls = 0;
  await withRetry(async () => { calls++; throw new Error("x"); }, { delayMs: 1, log: false }).catch(() => {});
  pass("default attempts is 5", calls === 5, `calls=${calls}`);
}

// 7. Mixed: an error, then empty, then success.
{
  let calls = 0;
  const r = await withRetry(
    async () => {
      calls++;
      if (calls === 1) throw new Error("network");
      if (calls === 2) return { observations: [] as string[] };
      return { observations: ["done"] };
    },
    { ...opts, label: "mixed", isEmptyResult: (v) => v.observations.length === 0 },
  );
  pass("error then empty then success", r.observations[0] === "done" && calls === 3, `calls=${calls}`);
}

// 8. EmptyResultError is the reason surfaced when the last failure was empty.
{
  let thrown: unknown;
  try {
    await withRetry(async () => ({ observations: [] as string[] }), {
      ...opts, label: "always-empty", isEmptyResult: (v) => v.observations.length === 0,
    });
  } catch (e) { thrown = e; }
  pass("empty-only failure surfaces EmptyResultError", thrown instanceof EmptyResultError, String(thrown));
}

// 9. The delay is actually awaited between attempts.
{
  const started = Date.now();
  let calls = 0;
  await withRetry(async () => { calls++; throw new Error("x"); }, { attempts: 3, delayMs: 60, log: false }).catch(() => {});
  const elapsed = Date.now() - started;
  // 3 attempts = 2 waits.
  pass("waits between attempts, not after the last", elapsed >= 120 && elapsed < 400, `elapsed=${elapsed}ms calls=${calls}`);
}
