// Loaded before anything else, because the provider clients read `process.env` at module
// scope and throw on import when a key is missing. ESM evaluates imports in order, so
// this has to come first even though it reads like an afterthought.
import "dotenv/config";

import {
  resetSearchProviders,
  webSearch,
  SEARCH_PROVIDER_ORDER,
  type SearchProviderName,
  type WebSearchResult,
} from "../AI/tools/webSearchTool.js";

// Failover behaviour, driven against stubbed providers so not a single search request is
// sent.
//
// The set of spent providers is deliberately process-wide, so a research run searching
// dozens of times discovers an exhausted provider once instead of on every call. That
// also means it has to be reset explicitly between the blocks below, or each one would
// inherit the previous one's findings - which is exactly how the first draft of this
// file failed.
//
// What is worth pinning:
//   - a provider that answers is used, and no other is called
//   - an allowance failure moves on and marks the provider spent
//   - a spent provider is skipped outright on the next call, not retried
//   - a transient failure moves on but does NOT mark the provider spent
//   - every provider's results come back in the same shape

let failures = 0;

const pass = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures += 1;

  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

const providers = (await import("../AI/tools/webSearchTool.js")).searchProviders;

type Provider = {
  search: (query: string, limit: number) => Promise<unknown>;
  normalize: (response: never) => unknown;
};

const originals = { ...providers };

const calls: SearchProviderName[] = [];

/** Replaces one provider's behaviour for the block that follows. */
const stub = (name: SearchProviderName, behavior: { ok?: unknown } | { throws: Error }): void => {
  (providers[name] as Provider).search = async () => {
    calls.push(name);

    if ("throws" in behavior) throw behavior.throws;

    return behavior.ok;
  };
};

/** Clears both the stubs and the spent set, so each block starts from nothing. */
const reset = (): void => {
  calls.length = 0;

  resetSearchProviders();

  for (const name of Object.keys(originals) as SearchProviderName[]) {
    const to = providers[name] as Provider;
    const from = originals[name] as Provider;

    to.search = from.search;
    to.normalize = from.normalize;
  }
};

const planLimit = () => new Error("This request exceeds your plan's set usage limit.");

// The three real normalised shapes, each exactly as its own normaliser returns it. These
// are the shapes that have to end up indistinguishable to a caller.
const braveShaped = {
  results: [{ title: "Brent rises", description: "Crude up 2%", extraSnippets: ["a", "b"] }],
  faq: [{ question: "Why?", answer: "Supply", title: "ignored" }],
};

const exaShaped = { results: [{ title: "Brent rises", highlights: ["a", "b"] }] };

const youShaped = {
  results: [{ title: "Brent rises", description: "Crude up 2%", snippets: ["a", "b"] }],
};

const shapeOf = (results: WebSearchResult[]) => ({
  keys: Object.keys(results[0] ?? {})
    .sort()
    .join(","),
  snippets: results[0]?.snippets.length ?? -1,
  title: results[0]?.title,
});

// 1. The first provider that answers is the one used, and nothing else is called.
{
  reset();

  stub("brave", { ok: {} });
  stub("you", { ok: {} });

  await webSearch("q", 3);

  pass("only the first provider is called when it answers", calls.length === 1, calls.join(","));
  pass("and it is the first in the order", calls[0] === SEARCH_PROVIDER_ORDER[0], calls[0] ?? "");
}

// 2. An allowance failure moves on, and marks that provider spent.
{
  reset();

  stub("brave", { throws: planLimit() });
  stub("you", { ok: {} });

  const first = await webSearch("q", 3);

  pass("an allowance failure fails over", calls.includes("you"), calls.join(","));
  pass("the provider that answered is reported", first.provider === "you", first.provider);

  pass(
    "a provider that failed this call is in `failed`",
    first.failed.some((f) => f.provider === "brave"),
  );
  pass(
    "and not in `skipped`, which is for providers never tried",
    !first.skipped.includes("brave"),
    first.skipped.join(","),
  );

  // 3. Once spent, it is skipped outright rather than tried and failed again. This is
  //    the whole point: a run searching forty times should not pay forty round-trips to
  //    rediscover the same exhausted provider.
  calls.length = 0;

  const second = await webSearch("q2", 3);

  pass(
    "by the next call it is skipped outright",
    second.skipped.includes("brave"),
    second.skipped.join(","),
  );
  pass("and is not tried at all", !calls.includes("brave"), calls.join(","));

  await webSearch("q3", 3);

  pass(
    "and stays skipped on the third call too",
    calls.filter((c) => c === "brave").length === 0,
    calls.join(","),
  );
}

// 4. A transient failure moves on but does NOT burn the provider. A timeout says nothing
//    about the allowance, and treating it as spent would shrink the rotation for the run.
{
  reset();

  stub("brave", { throws: new Error("ECONNRESET") });
  stub("you", { ok: {} });

  const result = await webSearch("q", 3);

  pass("a network error still fails over", result.provider === "you", result.provider);
  pass(
    "but it is not recorded as an allowance failure",
    result.skipped.length === 0,
    result.skipped.join(","),
  );

  calls.length = 0;

  await webSearch("again", 3);

  pass("and the failing provider is tried again next time", calls[0] === "brave", calls.join(","));
}

// 5. Every provider's results must come back in one shape. This is why the tool reshapes
//    rather than passing a normaliser's output straight through.
{
  reset();

  (providers.brave as Provider).normalize = () => braveShaped;
  (providers.you as Provider).normalize = () => youShaped;
  (providers.exa as Provider).normalize = () => exaShaped;

  stub("brave", { ok: {} });

  const fromBrave = await webSearch("q", 3);

  stub("brave", { throws: planLimit() });

  const fromYou = await webSearch("q", 3);

  stub("you", { throws: planLimit() });

  const fromExa = await webSearch("q", 3);

  const a = shapeOf(fromBrave.results);
  const b = shapeOf(fromYou.results);
  const c = shapeOf(fromExa.results);

  pass("brave and you produce identical result keys", a.keys === b.keys, `${a.keys} vs ${b.keys}`);
  pass("and identical snippet counts", a.snippets === b.snippets, `${a.snippets} vs ${b.snippets}`);
  pass("and identical titles", a.title === b.title, `${a.title} vs ${b.title}`);
  pass(
    "exa maps its `highlights` onto `snippets`",
    c.snippets === a.snippets,
    `exa=${c.snippets} brave=${a.snippets}`,
  );
  pass("and every provider reports the same keys", c.keys === a.keys, `${c.keys} vs ${a.keys}`);

  pass(
    "brave's faq survives the reshape",
    fromBrave.faq.length === 1 && fromBrave.faq[0]?.question === "Why?",
  );
  pass("a provider with no faq returns an empty array", fromExa.faq.length === 0);
}

// 6. Nothing available is a loud, specific failure rather than a silent empty result - a
//    quiet empty result is indistinguishable from a day with nothing to report.
{
  reset();

  for (const name of SEARCH_PROVIDER_ORDER) stub(name, { throws: planLimit() });

  let message = "";

  try {
    await webSearch("what happened", 3);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  pass("with no provider left it throws", message.length > 0);
  pass(
    "and names every provider it tried",
    SEARCH_PROVIDER_ORDER.every((n) => message.includes(n)),
    message.slice(0, 140),
  );
  pass("and repeats the query", message.includes("what happened"));
}

reset();

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
