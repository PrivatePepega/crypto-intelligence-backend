import type { LanguageModelUsage } from "ai";

// --------------------------------------------------
// Run cost
// --------------------------------------------------
//
// What one agent run spent, in US dollars.
//
// ## Why this exists at all
//
// `usage` from the AI SDK carries tokens and nothing else. A `generateText` result's
// `usage` is five token fields, and for OpenAI and Google that is the whole of it -
// there is no cost on the object and no `raw` block, because neither provider sends
// extra usage fields. So the spend cannot be read off a call the way token counts can.
//
// Two mechanisms, in order of preference:
//
// 1. **Reported.** OpenRouter returns `cost` on the response, which the SDK surfaces
//    under `usage.raw`. This is authoritative - it is what was actually charged, after
//    whatever discounts and routing the account is on - and it is the only correct
//    source for `openrouter/free`, which picks a different model per request and
//    therefore cannot be priced from a table at all.
// 2. **Priced.** Token counts multiplied by {@link MODEL_PRICES}. For OpenAI and Google,
//    the only way.
//
// ## Why a total of null is a real answer
//
// A run that touched one unpriced model has no total. Adding up the priced part and
// calling it the total would understate the bill while looking precise, which is worse
// than saying nothing. So `totalUsd` is `null` when any call is unpriced, and
// `pricedSubtotalUsd` is reported alongside it so the priced part is not thrown away.
// A missing number reads as "unknown"; a low number reads as "cheap".
// --------------------------------------------------

/** One model's published rates, in US dollars per million tokens. */
export type ModelPrice = {
  /** Uncached input. */
  inputPerMillion: number;

  /**
   * Output, including reasoning tokens.
   *
   * Both providers bill thinking tokens as output, so this covers
   * `outputTokens` whole. Reasoning is deliberately *not* added again from
   * `outputTokenDetails.reasoningTokens` - doing so would double-count it.
   */
  outputPerMillion: number;

  /** Input served from the provider's cache, when cheaper than fresh input. */
  cacheReadPerMillion?: number;

  /** Input written into the cache, when charged. */
  cacheWritePerMillion?: number;

  /**
   * Input tokens above which the whole request is billed at a multiple.
   *
   * OpenAI doubles input and 1.5x's output past 272K on the GPT-6 family. A run whose
   * cumulative *per call* input exceeds this is not billed at the headline rate, and a
   * table that ignored that would quietly under-report the largest runs.
   */
  longContextAboveTokens?: number;

  longContextInputMultiplier?: number;
  longContextOutputMultiplier?: number;

  /** Where the numbers came from, so they can be re-checked rather than trusted. */
  source: string;

  /** The date these rates were true. */
  asOf: string;

  /**
   * Set when the rate is temporary, saying what replaces it.
   *
   * An introductory price that silently becomes the standard price makes every cost
   * figure recorded before the switch a floor rather than an estimate.
   */
  revertsTo?: string;
};

/** The date the whole table was last checked. Stamped onto every run's cost block. */
export const PRICE_TABLE_AS_OF = "2026-10-14";

/**
 * Per-token rates for the models this pipeline runs on.
 *
 * Only models an agent actually calls belong here. A model absent from this table is
 * not free and not zero - it is unpriced, and produces a null cost.
 *
 * `openrouter/*` is deliberately absent: the router reports its own cost, and the
 * `free` variant changes model per request so a table entry would be a guess dressed
 * as a fact.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  // The Researcher runs on this. Introductory rate; standard is double from 2027-01-01.
  "gemini-3.8-flash": {
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
    cacheReadPerMillion: 0.07,
    cacheWritePerMillion: 0.04,
    source: "ai.google.dev/gemini-api/docs/pricing, cross-checked against the DeepMind model card",
    asOf: PRICE_TABLE_AS_OF,
    revertsTo: "$1.50 input / $7.50 output standard pricing from 2027-01-01",
  },

  // Configured but not yet wired to an agent. Present so pointing a stage at it is
  // not a step that silently starts producing null costs.
  "gpt-6-luna": {
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    cacheReadPerMillion: 0.01,
    cacheWritePerMillion: 0.125,
    longContextAboveTokens: 272_000,
    longContextInputMultiplier: 2,
    longContextOutputMultiplier: 1.5,
    source: "developers.openai.com/api/docs/models/gpt-6-luna",
    asOf: PRICE_TABLE_AS_OF,
  },
};

/** How one call's cost was arrived at. */
export type CostSource = "reported" | "priced" | "unpriced";

/** One model call's cost, or the reason there is not one. */
export type CallCost = {
  usd: number | null;
  source: CostSource;

  /** Set when `source` is `"unpriced"`, so a null is never unexplained. */
  reason?: string;

  inputTokens: number;
  outputTokens: number;
};

/** Totals for one model across a run. */
export type ModelCost = {
  usd: number | null;
  source: CostSource;
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

/** What a run log carries. Written on every append, so it survives a crash. */
export type RunCost = {
  /**
   * The run's spend, or `null` when any call could not be priced.
   *
   * Deliberately not a sum of what is known. A run with one unpriced call has no
   * total, and {@link RunCost.pricedSubtotalUsd} holds the part that could be.
   */
  totalUsd: number | null;

  /** What was priced, even when the total is unknown. Never null. */
  pricedSubtotalUsd: number;

  /** True when every call in the run was priced. `false` makes `totalUsd` null. */
  complete: boolean;

  calls: number;
  inputTokens: number;
  outputTokens: number;

  byModel: Record<string, ModelCost>;

  /** Models seen this run that are not in {@link MODEL_PRICES} and reported no cost. */
  unpricedModels: string[];

  /** When the price table behind the computed figures was checked. */
  priceTableAsOf: string;
};

/** What {@link createRunCost.add} is given. */
export type UsageRecord = {
  /** The model id, as reported by `modelIdOf`. */
  modelId: string;

  /**
   * The SDK's usage object, taken whole rather than narrowed.
   *
   * Narrowing it to the four fields read here does not typecheck: the SDK declares
   * them as required `number | undefined`, which under `exactOptionalPropertyTypes` is
   * not assignable to an optional `foo?: number`. That flag treats "possibly absent"
   * and "present and undefined" as different, and the SDK's usage shape is the former.
   */
  usage: LanguageModelUsage;
};

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * The cost a provider reported, if it reported one.
 *
 * OpenRouter puts `cost` on the response in US dollars. It arrives under `usage.raw`
 * because the SDK normalises usage and puts anything extra the provider sent there.
 * Checked defensively at every level because a provider that has never sent this field
 * cannot be trusted to send it in a known shape.
 */
const reportedCost = (usage: LanguageModelUsage): number | null => {
  const raw = usage.raw;

  if (typeof raw !== "object" || raw === null) return null;

  const cost = (raw as Record<string, unknown>).cost;

  return typeof cost === "number" && Number.isFinite(cost) ? cost : null;
};

/** What a call costs when the provider told us. */
const costOfCall = (record: UsageRecord): CallCost => {
  const inputTokens = num(record.usage.inputTokens);
  const outputTokens = num(record.usage.outputTokens);

  const reported = reportedCost(record.usage);

  if (reported !== null) {
    return { usd: reported, source: "reported", inputTokens, outputTokens };
  }

  const price = MODEL_PRICES[record.modelId];

  if (price === undefined) {
    return {
      usd: null,
      source: "unpriced",
      reason: `no price for "${record.modelId}" and the provider reported no cost`,
      inputTokens,
      outputTokens,
    };
  }

  const details = record.usage.inputTokenDetails;

  const cacheRead = num(details?.cacheReadTokens);
  const cacheWrite = num(details?.cacheWriteTokens);

  // `noCacheTokens` is the SDK's own split, and the only one that does not
  // double-count. Falls back to the full input when a provider omits it.
  const noCache = num(details?.noCacheTokens);
  const fresh = noCache > 0 || inputTokens === 0 ? noCache : inputTokens - cacheRead;

  const longContext =
    price.longContextAboveTokens !== undefined && inputTokens > price.longContextAboveTokens;

  const inputMultiplier = longContext ? (price.longContextInputMultiplier ?? 1) : 1;
  const outputMultiplier = longContext ? (price.longContextOutputMultiplier ?? 1) : 1;

  const usd =
    (fresh * price.inputPerMillion * inputMultiplier +
      cacheRead * (price.cacheReadPerMillion ?? price.inputPerMillion) +
      cacheWrite * (price.cacheWritePerMillion ?? price.inputPerMillion)) /
      1_000_000 +
    (outputTokens * price.outputPerMillion * outputMultiplier) / 1_000_000;

  return { usd, source: "priced", inputTokens, outputTokens };
};

/**
 * A run's running cost total.
 *
 * Fed one call at a time and read back at any point. Deliberately not a class: every
 * agent holds one of these for the length of its run and nothing else, so a closure
 * with a factory is smaller and easier to pass around than an object with a prototype.
 */
export const createRunCost = (): {
  add: (record: UsageRecord) => void;
  total: () => RunCost;
} => {
  const byModel: Record<string, ModelCost> = {};

  const unpriced = new Set<string>();

  let pricedSubtotalUsd = 0;

  let calls = 0;

  let inputTokens = 0;

  let outputTokens = 0;

  return {
    add: (record) => {
      const cost = costOfCall(record);

      calls += 1;
      inputTokens += cost.inputTokens;
      outputTokens += cost.outputTokens;

      const existing = byModel[record.modelId];

      if (existing === undefined) {
        byModel[record.modelId] = {
          usd: cost.usd,
          source: cost.source,
          calls: 1,
          inputTokens: cost.inputTokens,
          outputTokens: cost.outputTokens,
        };
      } else {
        existing.calls += 1;
        existing.inputTokens += cost.inputTokens;
        existing.outputTokens += cost.outputTokens;

        // Two sources for one model means the run is no longer complete, whatever the
        // numbers add up to.
        if (existing.source !== cost.source) {
          existing.source = "unpriced";
          existing.usd = null;
        } else if (existing.usd !== null && cost.usd !== null) {
          existing.usd += cost.usd;
        } else {
          existing.usd = null;
        }
      }

      if (cost.usd === null) {
        unpriced.add(record.modelId);
      } else {
        pricedSubtotalUsd += cost.usd;
      }
    },

    total: (): RunCost => {
      const complete = unpriced.size === 0;

      return {
        totalUsd: complete ? pricedSubtotalUsd : null,
        pricedSubtotalUsd,
        complete,
        calls,
        inputTokens,
        outputTokens,
        byModel,
        unpricedModels: [...unpriced],
        priceTableAsOf: PRICE_TABLE_AS_OF,
      };
    },
  };
};
