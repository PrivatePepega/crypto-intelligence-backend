import "dotenv/config";

import {
  CryptoCvApiError,
  cryptoCvGet,
  cryptoCvPost,
  type CryptoCvSemanticResponse,
} from "./client.js";

/**
 * Isolated probe of `POST /api/search/semantic`.
 *
 * Run: npx tsx mcp/cryptocurrency.cv/semanticSearch.test.ts
 *
 * **This script touches no other endpoint.** Everything here targets
 * `/api/search/semantic` alone, so the account's per-endpoint rate limit is
 * spent on one route and the findings cannot be confused by unrelated throttling.
 *
 * ## Why it exists
 *
 * The endpoint is called "semantic search" and the docs describe
 * `GET /api/search/semantic?q=...`. Neither is true:
 *
 *  - `GET` returns 405 on every query-parameter form.
 *  - `POST` with `{ q }` returns `{"error":"query is required"}`.
 *  - `POST` with `{ query }` returns
 *    `{"error":"articles array is required and must not be empty"}`.
 *
 * So the caller supplies the candidate articles. What is still unknown, and what
 * this script measures, is **how the score is actually computed** - which fields
 * are read, whether matching is fuzzy or literal, and whether anything returns
 * the articles themselves.
 *
 * Earlier probing suggested scores were binary, which would make this weaker
 * than the plain keyword search on `/api/search`. That was wrong - scores are
 * fractional. See "What is already known" below and re-run to fill in the rest.
 */

/**
 * Pause between probes, in milliseconds.
 *
 * The endpoint advertises ~30 requests/minute but throttles well below that in
 * practice: a burst of 24 probes tripped `ROUTE_RATE_LIMIT` after 8. Spacing
 * them out keeps the whole set in one run instead of losing the tail to
 * throttling. Override with `SEMANTIC_PROBE_DELAY_MS`.
 */
const DELAY_MS = Number(process.env.SEMANTIC_PROBE_DELAY_MS ?? 8000);

/**
 * What has been established so far. All scores against query `bitcoin` unless
 * stated otherwise.
 *
 * | probe                                              | result  |
 * | -------------------------------------------------- | ------- |
 * | `["Bitcoin rises"]` (bare string)                  | `0`     |
 * | `{ title: "Bitcoin rises" }`                        | `0.7071` |
 * | `{ title: "Bitcoin rises sharply", description: ...}`| `0.5773` |
 * | `{ title: "unrelated", description: "Bitcoin ..." }` | `0`     |
 * | `{ title: "unrelated", content: "Bitcoin rises" }`  | `0.5773` |
 * | query `"coin"` vs `{ title: "Bitcoin rises" }`      | `0`     |
 *
 * ## Confirmed
 *
 *  1. **`description` is not read.** The same text scores `0` in `description`
 *     but `0.5773` in `content`. Only `title` and `content` are scored.
 *  2. **Scores are fractional**, following `matches / sqrt(readableTokens)` -
 *     one match against a two-token title gives `1/sqrt(2) = 0.7071`, one
 *     against a three-token readable field gives `1/sqrt(3) = 0.5773`.
 *  3. **Whole-token matching, not substring.** Query `coin` against
 *     `Bitcoin rises` scores `0`.
 *  4. **Bare string articles score `0`** - there is no field for the scorer to
 *     read, so articles must be objects.
 *  5. **`results` aligns positionally with the input array**, and `total`
 *     equals the input length. `limit`, `top_k` and `threshold` are unverified.
 *
 * So it is a crude term-frequency ratio over `title` and `content`, not a vector
 * search - and notably it **cannot see `description`**, which is the only summary
 * field the news feeds actually populate. Feeding it `/api/news` output would
 * score against headlines alone.
 *
 * ## Unanswered
 *
 * Case sensitivity, multi-word partial overlap, synonymy, deduplication, whether
 * `limit`/`top_k`/`threshold` do anything, and behaviour at 20 articles.
 *
 * ## Rate limiting
 *
 * This route throttles hard and escalates: a run that trips `ROUTE_RATE_LIMIT`
 * and keeps going gets a `403 REPEAT_RATE_LIMIT_ABUSE` temporary block, after
 * which **every** probe fails regardless of spacing. Two runs have hit that.
 * Treat the remaining questions as one batch to run after the block clears, not
 * something to retry in a loop - each attempt while blocked extends it.
 */

const ENDPOINT = "/api/search/semantic";

/** One probe. Each is a single request so failures stay attributable. */
interface Probe {
  label: string;
  /** Question this probe answers. */
  question: string;
  body?: unknown;
  method?: "GET" | "POST";
  path?: string;
}

const PROBES: Probe[] = [
  // --- establishing the baseline contract ---
  {
    label: "minimal: query + 1 string article",
    question: "Does a bare string article work?",
    body: { query: "bitcoin", articles: ["Bitcoin rises"] },
  },
  {
    label: "minimal: query + 1 object article",
    question: "Does a single object article work?",
    body: { query: "bitcoin", articles: [{ title: "Bitcoin rises" }] },
  },
  {
    label: "no query key",
    question: "Is `query` required?",
    body: { articles: [{ title: "Bitcoin rises" }] },
  },
  {
    label: "empty articles array",
    question: "Is a non-empty array required?",
    body: { query: "bitcoin", articles: [] },
  },
  {
    label: "articles not an array",
    question: "What if articles is a string?",
    body: { query: "bitcoin", articles: "Bitcoin rises" },
  },
  {
    label: "query is an array",
    question: "Does query accept an array?",
    body: { query: ["bitcoin", "ethereum"], articles: [{ title: "Bitcoin rises" }] },
  },
  {
    label: "empty query string",
    question: "Does an empty query match everything?",
    body: { query: "", articles: [{ title: "Bitcoin rises" }] },
  },

  // --- which field is actually read? ---
  {
    label: "match in title only",
    question: "Is `title` scored?",
    body: {
      query: "bitcoin",
      articles: [{ title: "Bitcoin rises sharply", description: "unrelated text" }],
    },
  },
  {
    label: "match in description only",
    question: "Is `description` scored?",
    body: {
      query: "bitcoin",
      articles: [{ title: "unrelated", description: "Bitcoin rises sharply" }],
    },
  },
  {
    label: "match in content only",
    question: "Is `content` scored?",
    body: {
      query: "bitcoin",
      articles: [{ title: "unrelated", description: "unrelated", content: "Bitcoin rises" }],
    },
  },
  {
    label: "match in an unknown field",
    question: "Does an unrecognised field get scored?",
    body: { query: "bitcoin", articles: [{ zzz: "Bitcoin rises" }] },
  },

  // --- how literal is the match? ---
  {
    label: "case differs",
    question: "Is matching case-sensitive?",
    body: {
      query: "BITCOIN",
      articles: [{ title: "bitcoin rises" }, { title: "Bitcoin rises" }],
    },
  },
  {
    label: "substring only",
    question: "Is it substring or whole-token?",
    body: {
      query: "coin",
      articles: [{ title: "Bitcoin rises" }, { title: "Ethereum rises" }],
    },
  },
  {
    label: "two words, one matches",
    question: "Does partial word overlap score?",
    body: {
      query: "bitcoin etf",
      articles: [{ title: "Bitcoin ETF approved" }, { title: "Ethereum ETF approved" }],
    },
  },
  {
    label: "synonym - regulation vs rules",
    question: "Any synonymy or concept matching?",
    body: {
      query: "crypto regulation",
      articles: [
        { title: "SEC approves bitcoin ETF" },
        { title: "Treasury publishes stablecoin rules" },
      ],
    },
  },
  {
    label: "semantic pair - ETF/approval",
    question: "Is 'approval' close to 'approved'?",
    body: {
      query: "regulatory approval",
      articles: [
        { title: "Regulator approves spot bitcoin ETF" },
        { title: "Dogecoin community hosts meetup" },
      ],
    },
  },

  // --- what comes back? ---
  {
    label: "3 distinct articles, one matching",
    question: "Are results in input order, or ranked?",
    body: {
      query: "bitcoin",
      articles: [
        { title: "Dogecoin meetup" },
        { title: "Bitcoin ETF approved" },
        { title: "Ethereum staking update" },
      ],
    },
  },
  {
    label: "duplicate articles",
    question: "Are duplicates deduplicated?",
    body: {
      query: "bitcoin",
      articles: [{ title: "Bitcoin ETF approved" }, { title: "Bitcoin ETF approved" }],
    },
  },
  {
    label: "extra body: limit",
    question: "Does `limit` change anything?",
    body: {
      query: "bitcoin",
      articles: [
        { title: "Bitcoin ETF approved" },
        { title: "Dogecoin meetup" },
        { title: "Ethereum staking" },
      ],
      limit: 1,
    },
  },
  {
    label: "extra body: top_k",
    question: "Does `top_k` change anything?",
    body: {
      query: "bitcoin",
      articles: [
        { title: "Bitcoin ETF approved" },
        { title: "Dogecoin meetup" },
        { title: "Ethereum staking" },
      ],
      top_k: 1,
    },
  },
  {
    label: "extra body: threshold",
    question: "Does `threshold` change anything?",
    body: {
      query: "bitcoin",
      articles: [
        { title: "Bitcoin ETF approved" },
        { title: "Dogecoin meetup" },
      ],
      threshold: 0.5,
    },
  },

  // --- scale ---
  {
    label: "20 articles",
    question: "Does it scale, and is total the input length?",
    body: {
      query: "bitcoin",
      articles: Array.from({ length: 20 }, (_, i) => ({
        title: i === 7 ? "Bitcoin ETF approved" : `Article ${i}`,
        description: `Body ${i}`,
      })),
    },
  },

  // --- the documented GET form, for the record ---
  {
    label: "GET with query param",
    question: "Does the documented GET form ever work?",
    method: "GET",
    path: `${ENDPOINT}?query=bitcoin&limit=5`,
  },
  {
    label: "POST with query param, no body",
    question: "Can the query go in the URL instead of the body?",
    method: "POST",
    path: `${ENDPOINT}?query=bitcoin`,
    body: { articles: [{ title: "Bitcoin ETF approved" }] },
  },
];

/** Sends one probe and prints the outcome. */
const run = async (probe: Probe): Promise<void> => {
  const method = probe.method ?? "POST";
  const path = probe.path ?? ENDPOINT;

  process.stdout.write(`\n  ${probe.label}\n`);
  console.log(`    asks: ${probe.question}`);

  const startedAt = Date.now();

  try {
    const payload = await cryptoCvPost(path, {}, probe.body);

    const response = payload as CryptoCvSemanticResponse;

    const scores = (response.results ?? []).map((result) => result.score);

    console.log(`    -> ${Date.now() - startedAt}ms  scores: [${scores.join(", ")}]`);
    console.log(`       total=${response.total ?? "?"}  keys=[${Object.keys(response).join(",")}]`);

    // The full result object, so any unexpected field shows up.
    const first = (response.results ?? [])[0] as Record<string, unknown> | undefined;

    if (first && Object.keys(first).length > 1) {
      console.log(`       result[0] has extra fields: [${Object.keys(first).join(",")}]`);
    }
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error));

    const status = error instanceof CryptoCvApiError ? error.status : null;

    console.log(`    -> ${Date.now() - startedAt}ms  ${status ?? "error"}: ${message.replace(/\s+/g, " ").slice(0, 150)}`);
  }

  void method;
};

const main = async (): Promise<void> => {
  console.log("");
  console.log("=".repeat(70));
  console.log("/api/search/semantic - isolated probe");
  console.log("=".repeat(70));
  console.log(`  endpoint : ${ENDPOINT}`);
  console.log(`  probes   : ${PROBES.length}`);
  console.log("  scope    : this endpoint only, nothing else is called");

  for (const [index, probe] of PROBES.entries()) {
    await run(probe);

    // Throttle between probes, but not after the last one.
    if (index < PROBES.length - 1 && DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log("");
  console.log("=".repeat(70));
  console.log("done - interpret the scores above");
  console.log("=".repeat(70));
};

void main().catch((error: unknown) => {
  console.error(error);

  process.exitCode = 1;
});