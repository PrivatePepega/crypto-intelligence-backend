// A runnable check on the freesea provider.
//
// Exists so the raw response can be read and judged the moment their search backend is
// accepting requests again. It prints the whole body unedited rather than a summary,
// because "is this index any good" is a question about the actual results and a summary
// hides the parts worth judging - relevance, whether financial news appears at all,
// whether ads are mixed in, and whether the extracts are usable.
//
//   npx.cmd tsx scripts/freesea.probe.mts                    the default queries
//   npx.cmd tsx scripts/freesea.probe.mts "a query"          one query of your own
//   npx.cmd tsx scripts/freesea.probe.mts --depth advanced    longer extracts
//
// freesea answers 429 whenever its search backend is saturated, and its Retry-After header
// says 1 second when the useful wait is much longer. This retries on a growing backoff
// and then gives up, so it does not sit hammering a service that has already said no.

import "dotenv/config";

const API_URL = "https://freesea.dev/v1/search";
const API_KEY = process.env.FREESEA_API_KEY;

if (!API_KEY) {
  throw new Error("FREESEA_API_KEY is not configured.");
}

// Chosen to be answerable and checkable, so a thin or off-index answer is obvious rather
// than plausible-looking. Same shape as the Gemini probe's defaults, on purpose.
const DEFAULT_QUERIES = [
  "brent crude oil price today",
  "federal reserve interest rate decision",
  "bitcoin price today",
];

const args = process.argv.slice(2);

const depth = args.includes("--depth") ? "advanced" : "basic";

const positional = args.filter((a) => !a.startsWith("--"));

const queries = positional.length > 0 ? positional : DEFAULT_QUERIES;

/** Growing backoff, because their Retry-After header does not describe the real wait. */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const search = async (query: string): Promise<Response> =>
  await fetch(API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query, max_results: 10, search_depth: depth }),
  });

for (const query of queries) {
  console.log(`\n=== ${query} ===`);

  let body = "";
  let ok = false;

  for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
    const started = Date.now();

    const response = await search(query);

    const text = await response.text();

    console.log(
      `attempt ${attempt}: HTTP ${response.status}  ` +
        `${Math.round((Date.now() - started) / 1000)}s  ${text.length} chars`,
    );

    if (response.ok) {
      body = text;
      ok = true;

      break;
    }

    if (attempt < 3) {
      const pause = attempt * 20_000;

      console.log(`  ${text.slice(0, 120)}`);
      console.log(`  waiting ${pause / 1000}s`);

      await wait(pause);
    } else {
      console.log(`  gave up: ${text.slice(0, 160)}`);
    }
  }

  if (!ok) continue;

  console.log("\n--- FULL RAW RESPONSE ---");
  console.log(body);
  console.log("--- END RAW RESPONSE ---");

  // A short read on top of the raw body, so the shape is visible without scrolling.
  try {
    const parsed = JSON.parse(body) as {
      results?: {
        title?: string;
        url?: string;
        domain?: string;
        content?: string;
        position?: number;
        type?: string;
        incentive?: string;
      }[];
    };

    const results = parsed.results ?? [];

    const sponsored = results.filter((r) => (r.type ?? "").toLowerCase() === "sponsored");

    console.log(
      `\nshape: ${results.length} results, keys = ${Object.keys(results[0] ?? {}).join(", ")}`,
    );
    console.log(`sponsored: ${sponsored.length} (excluded by the normalizer)`);

    for (const [i, r] of results.entries()) {
      const kind = (r.type ?? "organic").toLowerCase() === "sponsored" ? "AD " : "   ";

      console.log(`${kind}[${r.position ?? i}] ${(r.title ?? "").slice(0, 62)}`);
      console.log(
        `      ${(r.domain ?? "?").padEnd(24)} ${(r.content ?? "").slice(0, 70).replace(/\s+/g, " ")}`,
      );

      // Surfaced rather than acted on. This pipeline does not use incentives; printing
      // them here is so it is obvious whether ads are appearing at all in these queries.
      if (r.incentive) console.log(`      *** incentive: ${r.incentive.slice(0, 100)}`);
    }
  } catch (error) {
    console.log(
      `\n(could not parse the body as JSON: ${error instanceof Error ? error.message : "?"})`,
    );
  }
}

console.log("\nRead the raw bodies above to judge the index; the tool's normalizer drops ads.");
