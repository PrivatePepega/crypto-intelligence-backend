import { createRunCost, MODEL_PRICES, PRICE_TABLE_AS_OF } from "../AI/utils/weather/cost.js";

// What one agent run spent, in US dollars.
//
// The two cases that decide whether this works at all:
//
// 1. A `generateText` result's `usage` has five token fields and no cost. A live call
//    to gpt-6-luna returned `{inputTokens: 13, inputTokenDetails: {...},
//    outputTokens: 5, outputTokenDetails: {...}, totalTokens: 18}` - no `cost`, no
//    `raw`. So a provider that does not report spend has to be priced from a table.
// 2. `openrouter/free` reports its own cost, and cannot be priced from a table at all,
//    because it picks a different model per request.

let failures = 0;

const pass = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures += 1;

  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

/**
 * A usage object shaped as the SDK really returns one.
 *
 * The cost module takes `LanguageModelUsage` whole rather than a narrowed subset,
 * because `exactOptionalPropertyTypes` makes the SDK's required
 * `number | undefined` detail fields unassignable to an optional `foo?: number`. A
 * test hand-rolling a two-field object would then not typecheck against the same type
 * the agents pass, so the shape is built properly here too.
 */
const usage = (input: number, output: number, extra: Record<string, unknown> = {}) => ({
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
  inputTokenDetails: { noCacheTokens: input, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokenDetails: { textTokens: output, reasoningTokens: 0 },
  ...extra,
});

/**
 * A million tokens each way, which is the table rate times 1e6.
 *
 * Goes through `usage` so it carries the same shape as every other call in this file -
 * a second hand-rolled object would be one more thing to keep in step.
 */
const million = () => usage(1_000_000, 1_000_000);

// ---- reported cost, the OpenRouter path ----

// 1. A cost on the raw usage wins over the table, because it is what was charged.
{
  const cost = createRunCost();

  cost.add({
    modelId: "openrouter/some-model",
    usage: usage(1000, 500, { raw: { cost: 0.0042 } }),
  });

  const total = cost.total();

  pass("a reported cost is used", total.totalUsd === 0.0042, String(total.totalUsd));
  pass("its source is 'reported'", total.byModel["openrouter/some-model"]?.source === "reported");
  pass("an unpriced model id still has a cost", total.complete);
}

// 2. A raw object with no cost falls through to the table rather than to null.
{
  const cost = createRunCost();

  cost.add({ modelId: "gemini-3.8-flash", usage: usage(1000, 500, { raw: { somethingElse: 1 } }) });

  const total = cost.total();

  pass(
    "a raw object without cost falls through to pricing",
    total.byModel["gemini-3.8-flash"]?.source === "priced",
  );
}

// ---- priced cost, the OpenAI and Google path ----

// 3. One million tokens in and out costs exactly the table rate.
{
  const cost = createRunCost();

  cost.add({ modelId: "gemini-3.8-flash", usage: million() });

  const expected =
    MODEL_PRICES["gemini-3.8-flash"]!.inputPerMillion +
    MODEL_PRICES["gemini-3.8-flash"]!.outputPerMillion;

  const actual = cost.total().totalUsd;

  pass(
    "1M in + 1M out equals the table rate",
    Math.abs((actual ?? 0) - expected) < 1e-9,
    `${actual} vs ${expected}`,
  );
}

// 4. The same for the model that is configured but not yet in use.
//
//    1M input tokens is well past OpenAI's 272K long-context threshold, so this is NOT
//    the headline $0.60 - input bills at 2x and output at 1.5x, giving $0.95. That is
//    the correct answer, and case 10 pins the same rule from the other direction.
{
  const cost = createRunCost();

  cost.add({ modelId: "gpt-6-luna", usage: million() });

  const price = MODEL_PRICES["gpt-6-luna"]!;

  const expected =
    price.inputPerMillion * (price.longContextInputMultiplier ?? 1) +
    price.outputPerMillion * (price.longContextOutputMultiplier ?? 1);

  const actual = cost.total().totalUsd;

  pass(
    "1M in + 1M out on gpt-6-luna is $0.95, not the headline $0.60",
    Math.abs((actual ?? 0) - 0.95) < 1e-9,
    String(actual),
  );
  pass(
    "which is the table rate times the long-context multipliers",
    Math.abs((actual ?? 0) - expected) < 1e-9,
  );
}

// 4b. Below the threshold the headline rate applies unchanged.
{
  const cost = createRunCost();

  cost.add({ modelId: "gpt-6-luna", usage: usage(200_000, 1_000_000) });

  const price = MODEL_PRICES["gpt-6-luna"]!;

  const expected = (200_000 * price.inputPerMillion) / 1_000_000 + price.outputPerMillion;

  pass(
    "200K input is billed at the headline rate",
    Math.abs((cost.total().totalUsd ?? 0) - expected) < 1e-9,
    String(cost.total().totalUsd),
  );
}

// 5. Cached input is cheaper than fresh, and is not double-counted.
{
  const cost = createRunCost();

  cost.add({
    modelId: "gpt-6-luna",
    usage: usage(0, 0, {
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 },
    }),
  });

  const expected = MODEL_PRICES["gpt-6-luna"]!.cacheReadPerMillion;

  pass(
    "1M cached input costs the cache-read rate",
    Math.abs((cost.total().totalUsd ?? 0) - (expected ?? 0)) < 1e-9,
    String(cost.total().totalUsd),
  );
}

// 6. A run that touched a model with no price has no total - and says so.
{
  const cost = createRunCost();

  cost.add({ modelId: "gemini-3.8-flash", usage: million() });
  cost.add({ modelId: "some-unknown-model", usage: usage(10, 10) });

  const total = cost.total();

  pass("an unpriced model makes the total null", total.totalUsd === null, String(total.totalUsd));
  pass(
    "but the priced part is still reported",
    total.pricedSubtotalUsd > 0,
    String(total.pricedSubtotalUsd),
  );
  pass("and it names the model", total.unpricedModels.includes("some-unknown-model"));
  pass("and complete is false", total.complete === false);
}

// 7. Null is distinguishable from zero. This is the whole reason for the design.
{
  const empty = createRunCost().total();

  pass("a run with no calls has a zero total", empty.totalUsd === 0);
  pass("a run with no calls is still complete", empty.complete);
}

// 8. Totals add up across models, and the model breakdown does too.
{
  const cost = createRunCost();

  cost.add({ modelId: "gemini-3.8-flash", usage: usage(1_000_000, 0) });
  cost.add({ modelId: "gpt-6-luna", usage: usage(0, 1_000_000) });

  const total = cost.total();

  const expected = 0.75 + 0.5;

  pass(
    "costs add across models",
    Math.abs((total.totalUsd ?? 0) - expected) < 1e-9,
    String(total.totalUsd),
  );
  pass(
    "input and output tokens accumulate",
    total.inputTokens === 1_000_000 && total.outputTokens === 1_000_000,
  );
  pass("both models are in the breakdown", Object.keys(total.byModel).length === 2);
  pass("the table date is stamped on", total.priceTableAsOf === PRICE_TABLE_AS_OF);
}

// 9. Reasoning tokens are already inside outputTokens and must not be added again.
{
  const withReasoning = createRunCost();

  withReasoning.add({
    modelId: "gpt-6-luna",
    usage: usage(0, 1000, { outputTokenDetails: { textTokens: 100, reasoningTokens: 900 } }),
  });

  const without = createRunCost();

  without.add({ modelId: "gpt-6-luna", usage: usage(0, 1000) });

  pass(
    "reasoning tokens are not added on top of output",
    withReasoning.total().totalUsd === without.total().totalUsd,
  );
}

// 10. OpenAI's long-context multiplier. A 400K-token prompt is not billed at the
//     headline rate, and a table that ignored that under-reports the largest runs.
{
  const cost = createRunCost();

  cost.add({ modelId: "gpt-6-luna", usage: usage(400_000, 1000) });

  const price = MODEL_PRICES["gpt-6-luna"]!;

  const expected =
    (400_000 * price.inputPerMillion * 2) / 1_000_000 +
    (1000 * price.outputPerMillion * 1.5) / 1_000_000;

  pass(
    "a 400K prompt is billed at the long-context rate",
    Math.abs((cost.total().totalUsd ?? 0) - expected) < 1e-9,
  );
}

// 11. openrouter/free must never be in the table: it changes model per request.
{
  pass("openrouter/free is not in the price table", MODEL_PRICES["openrouter/free"] === undefined);
}

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
