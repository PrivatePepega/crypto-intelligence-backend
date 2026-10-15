// A runnable check on the Gemini search tool.
//
// Exists because the tool's whole reason for dumping its raw response is that the
// grounding shape has not been confirmed yet, and confirming it needs a real call. This
// makes that call and prints what came back, so the shape can be read without reading
// a pipeline run log.
//
//   npx.cmd tsx scripts/geminiSearch.probe.mts            the default queries
//   npx.cmd tsx scripts/geminiSearch.probe.mts "a query"  one query of your own
//
// Writes its captures to AI/data/tools/, which is the point. Read those rather than
// this script's output: the output is a summary, the files are the evidence.

import { geminiSearch } from "../AI/tools/geminiSearch.js";

// Chosen to be answerable and checkable - a rate decision, a dated event, a named
// figure - rather than open-ended, so a thin or ungrounded answer is obvious.
const DEFAULT_QUERIES = [
  "What interest rate decision did the Federal Reserve make at its most recent FOMC meeting, and on what date?",
  "What is the current price of Brent crude oil in US dollars per barrel?",
];

const queries = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_QUERIES;

for (const query of queries) {
  console.log("\n=== query ===");
  console.log(query);

  const startedAt = Date.now();

  try {
    const result = await geminiSearch(query);

    const seconds = Math.round((Date.now() - startedAt) / 1000);

    console.log(`\n--- answer (${result.text.length} chars, ${seconds}s) ---`);
    console.log(result.text);

    console.log(
      `\ntokens: input=${result.inputTokens ?? "?"} output=${result.outputTokens ?? "?"}`,
    );
    console.log(`capture: ${result.artifact ?? "not written"}`);
  } catch (error) {
    console.log(`\n--- FAILED after ${Math.round((Date.now() - startedAt) / 1000)}s ---`);
    console.log(error instanceof Error ? error.message : String(error));
  }
}

console.log("\nCaptures are in AI/data/tools/. Read those for the grounding shape.");