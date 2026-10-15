import { writeToolArtifact } from "../AI/tools/geminiSearch.js";

import fs from "node:fs/promises";

// The logging half of the Gemini search tool, exercised without spending a provider
// call.
//
// That is the point: the raw captures in AI/data/tools/ exist so the grounding shape can
// be read and a normaliser written against it, and Google's daily quota was exhausted
// before the first capture could be taken. So the writing is verified here against a
// synthetic response, leaving only the shape itself - which is what the captures are for
// - unverified.
//
// The document below imitates a grounded response, including the parts whose shape is
// still unknown, so the writer is known to preserve them rather than reshape them.

let failures = 0;

const pass = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures += 1;

  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
};

const read = async (file: string) => JSON.parse(await fs.readFile(file, "utf8"));

/**
 * Everything this test wrote, so it can remove them again.
 *
 * A capture directory that mixes invented payloads with real ones is worse than an
 * empty one, because nobody can then tell which is which - and the entire purpose of
 * this directory is to be read.
 */
const written: string[] = [];

// A response shaped like the real thing, to the depth we know about and one level
// deeper than we do.
const groundedResponse = {
  text: "The Federal Reserve cut the target range to 4.25-4.50% on 23 September 2026.",
  finishReason: "stop",

  steps: [
    {
      stepNumber: 0,
      text: "",
      toolCalls: [
        { toolName: "google_search", input: { queries: ["FOMC decision September 2026"] } },
      ],
      toolResults: [
        {
          toolName: "google_search",
          toolCallId: "call_1",
          providerExecuted: true,
          output: {
            groundingChunks: [
              { web: { uri: "https://example.com/fomc", title: "FOMC statement" } },
            ],
          },
        },
      ],
    },
  ],

  usage: { inputTokens: 1200, outputTokens: 180, totalTokens: 1380 },

  // The shape nobody has confirmed. Preserved verbatim rather than picked apart.
  providerMetadata: [
    {
      google: {
        groundingMetadata: {
          webSearchQueries: ["FOMC decision September 2026"],
          groundingChunks: [{ web: { uri: "https://example.com/fomc", title: "FOMC statement" } }],
          // An unknown key, present to prove the writer does not filter.
          searchEntryPoint: { rendered: "<div>...</div>" },
        },
      },
    },
  ],

  warnings: undefined,
};

// 1. It writes, and says where.
{
  const artifact = await writeToolArtifact("gemini-search", {
    startedAt: "2026-10-14T00:00:00.000Z",
    writtenAt: "2026-10-14T00:00:02.000Z",
    query: "What did the Fed decide?",
    model: "gemini-3.8-flash",
    response: groundedResponse,
  });

  pass("an artifact is written", artifact !== null, artifact?.file ?? "null");

  if (artifact === null) {
    console.log("\nartifact writing failed, nothing left to check");
    process.exit(1);
  }

  written.push(artifact.file);

  pass(
    "it lands under AI/data/tools",
    artifact !== null && artifact.file.replace(/\\/g, "/").includes("AI/data/tools/"),
    artifact?.file ?? "",
  );

  pass("the character count is reported", artifact !== null && artifact.characters > 0);

  if (artifact !== null) {
    const document = await read(artifact.file);

    // 2. The query and model survive, so a capture can be identified on its own.
    pass("the query is recorded", document.query === "What did the Fed decide?");
    pass("the model is recorded", document.model === "gemini-3.8-flash");
    pass("the text is recorded", typeof document.response.text === "string");

    // 3. The parts the normaliser will be written against survive intact.
    pass(
      "the grounding metadata is preserved verbatim",
      document.response.providerMetadata[0].google.groundingMetadata.searchEntryPoint?.rendered !==
        undefined,
      "including a key nobody has looked at yet",
    );

    pass(
      "the provider-executed tool result is preserved",
      document.response.steps[0].toolResults[0].providerExecuted === true,
    );

    pass(
      "grounding chunks survive",
      document.response.providerMetadata[0].google.groundingMetadata.groundingChunks.length === 1,
    );

    pass("usage is recorded", document.response.usage.totalTokens === 1380);

    // 4. Numbering must not collide, or the second capture silently overwrites the first.
    const second = await writeToolArtifact("gemini-search", { query: "second", response: {} });

    if (second !== null) {
      pass("a second artifact gets a different file", second.file !== artifact.file, second.file);

      pass("and it did not overwrite the first", (await read(second.file)).query === "second");

      written.push(second.file);
    }
    pass(
      "the first is still readable",
      (await read(artifact.file)).query === "What did the Fed decide?",
    );
  }
}

// 5. The name is sanitised, because it becomes a file name.
{
  const artifact = await writeToolArtifact("weird name/with:chars", { probe: true });

  pass(
    "an awkward tool name is sanitised into a file name",
    artifact !== null && !/[\\/:]/.test((artifact?.file ?? "").split("/").pop() ?? ""),
    artifact?.file ?? "null",
  );

  if (artifact !== null) {
    const document = await read(artifact.file);

    pass("and the document still says what it really was", document.probe === true);

    written.push(artifact.file);
  }
}

for (const file of written) {
  await fs.rm(file, { force: true });
}

pass(
  "the synthetic captures were removed again",
  (await fs.stat("AI/data/tools").then(
    () => true,
    () => false,
  )) !== undefined,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
