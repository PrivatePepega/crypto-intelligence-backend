import { generateText, tool, type Tool } from "ai";
import { z } from "zod";

import google from "../providers/models/google.js";
import { models } from "../providers/model.js";
import { modelIdOf } from "../utils/agent.js";

import fs from "node:fs/promises";
import path from "node:path";

import { AGENT_RUN_LOG_DIR, toPathSegment, toReadableJson } from "../utils/logger.js";

// --------------------------------------------------
// Gemini as a search tool
// --------------------------------------------------
//
// Delegates web search to Gemini rather than to one of the `AI/providers/webSearch`
// clients, for a reason that is about quota rather than quality.
//
// The other search tools are HTTP calls against third-party APIs, each with its own key
// and its own daily allowance, and the agents spend that allowance one agentic step at
// a time. Gemini's free tier allows far more requests, and grounding is built into the
// model rather than bolted on - so the model decides what to search for, runs the
// search itself, and reports what it found, all inside one request.
//
// ## Why every call is written to disk
//
// The raw-response writer below is not debug scaffolding. It is the reason this tool
// returns what it returns rather than something tidier: grounding metadata is deeply
// nested and its shape differs between Gemini releases, so normalising it means knowing
// exactly what arrived. Every call writes its unfiltered response to `AI/data/tools/`
// first, and the normaliser gets written against those files rather than against a
// guess at the shape.
//
// Set GEMINI_SEARCH_ARTIFACTS to false and the files stop being written without any
// call site changing, because the path is an optional part of the result rather than an
// input the caller has to supply.
// --------------------------------------------------

/**
 * Whether each call's unfiltered response is written to `AI/data/tools/`.
 *
 * Same shape as `TRIAGE_ARTIFACTS` and `RESEARCHER_ARTIFACTS` elsewhere in the
 * pipeline: one switch, and the tool behaves the same either way because the artifact
 * is a side effect rather than something the result depends on.
 */
export const GEMINI_SEARCH_ARTIFACTS = true;

/** Where raw responses are written, relative to AI/data. */
const TOOL_ARTIFACT_DIR = path.join("tools");

/** The model that searches. Shared with the Researcher, so the quota is one pool. */
const SEARCH_MODEL = models.google3dot8Flash;

/** Where one artifact landed, or `null` when it could not be written. */
export type ToolArtifact = {
  /** Repository-relative path of the file written. */
  file: string;

  /** How many characters the file holds, so an oversized capture is obvious. */
  characters: number;
};

/** What the tool hands back to the calling agent. */
export type GeminiSearchResult = {
  /** The model's written answer, grounded in live search results. */
  text: string;

  /** Where the raw response was written, when artifacts are on. */
  artifact: string | null;

  /** Input tokens, so a caller can budget context before repeating a call. */
  inputTokens: number | null;

  /** Output tokens, for the same reason. */
  outputTokens: number | null;
};

/**
 * What a grounded Gemini response contains, as far as it has actually been seen.
 *
 * Typed loosely on purpose. `groundingMetadata` is where the real search results live
 * and its exact nesting has not been confirmed yet - which is the entire reason the
 * response is dumped unfiltered. A narrow type here would only hide the part nobody has
 * looked at.
 */
export type GroundedResponse = {
  text: string;

  finishReason: string | null;

  /**
   * Steps, with their provider-executed tool calls and results left intact.
   *
   * `google_search` is provider-executed: Google runs the search inside the request, so
   * the findings come back attached to a step rather than through a call this process
   * made. Recording the steps whole leaves the tool results in place for the normaliser
   * to be written against.
   */
  steps: unknown[];

  usage: unknown;

  /**
   * `providerMetadata` from each step that had any, unflattened.
   *
   * This is normally where `groundingMetadata` arrives. Left exactly as received,
   * including the keys the SDK did not recognise, rather than pulled out - the point of
   * the dump is to see what is actually there.
   */
  providerMetadata: unknown[];

  warnings: unknown;
};

let artifactRunNumber = 0;

/**
 * Writes one raw artifact and returns where it went.
 *
 * Numbered within the process and the counter is never reset, so a second capture in
 * the same session cannot overwrite the first - which is the failure mode that makes a
 * diagnostic dump worthless. Exported so the writing can be exercised without spending a
 * provider call, which matters because the whole point of these files is to be read
 * *before* the quota comes back.
 *
 * Never throws. A capture that could not be written is worth knowing about but not
 * worth losing a search result over, so failure is a `null` every caller already has to
 * handle.
 */
export const writeToolArtifact = async (
  name: string,
  document: Record<string, unknown>,
): Promise<ToolArtifact | null> => {
  if (!GEMINI_SEARCH_ARTIFACTS) return null;

  artifactRunNumber += 1;

  const directory = path.join(AGENT_RUN_LOG_DIR, TOOL_ARTIFACT_DIR);

  const fileName = `${toPathSegment(name)}-${String(artifactRunNumber).padStart(3, "0")}.json`;

  const filePath = path.join(directory, fileName);

  const relativeFile = path.relative(process.cwd(), filePath).split(path.sep).join("/");

  try {
    await fs.mkdir(directory, { recursive: true });

    const serialized = toReadableJson(document);

    await fs.writeFile(filePath, serialized, "utf8");

    return { file: relativeFile, characters: serialized.length };
  } catch {
    return null;
  }
};

/**
 * Runs one grounded search through Gemini.
 *
 * Nothing here calls a search API. `googleSearch` is a provider-executed tool: the tool
 * name goes into the request, Google runs the search inside the same call, and the
 * findings come back on the step. That is what makes this cheap against a daily quota -
 * the searching costs one Gemini request rather than one third-party request each.
 */
export const geminiSearch = async (query: string): Promise<GeminiSearchResult> => {
  const startedAt = new Date().toISOString();

  const result = await generateText({
    model: SEARCH_MODEL,

    system:
      "You are a search assistant. Search the web for the user's query and report what " +
      "you found. Prefer authoritative and primary sources - Reuters, AP, Bloomberg, " +
      "official statements, filings, and regulatory notices - over aggregators and " +
      "reposts. State what the sources say and name them. If the sources disagree, say " +
      "so rather than picking one silently. If you cannot find something, say that " +
      "rather than filling the gap from memory.",

    prompt: query,

    // Cast, and the reason is the same one documented on `agenticTooling`: `ai` and
    // `@ai-sdk/google` each depend on their own copy of `@ai-sdk/provider-utils`, so
    // their `Tool` types are nominally different and a provider-executed tool is not
    // assignable to a `ToolSet` even though it is one at runtime. It works; the two
    // packages just cannot see that they agree.
    tools: { google_search: google.tools.googleSearch({}) as Tool },
  });

  const steps = await result.steps;

  const usage = result.usage;

  const response: GroundedResponse = {
    text: result.text,
    finishReason: result.finishReason,

    // Recorded whole rather than mapped: the step objects carry the tool calls and their
    // results, and choosing fields out of them now would prejudge what matters.
    steps,
    usage,

    providerMetadata: steps
      .map((step) => step.providerMetadata)
      .filter((value) => value !== undefined),

    warnings: await result.warnings,
  };

  const artifact = await writeToolArtifact("gemini-search", {
    // When the call started as well as when the file was written, so a slow response is
    // visible without inferring it from the file's own timestamp.
    startedAt,
    writtenAt: new Date().toISOString(),

    query,
    model: modelIdOf(SEARCH_MODEL),

    response,
  });

  return {
    text: result.text,
    artifact: artifact === null ? null : artifact.file,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
  };
};

/** The tool the agents name. */
export const geminiSearchTool = tool({
  description:
    "Search the web through Gemini, which grounds its answer in live Google results and " +
    "names the sources it used. Returns a written summary of what was found rather than " +
    "a ranked list of raw pages.\n\n" +
    "Does: answer one factual question about current events, markets, companies, " +
    "regulation or policy from sources found on the web; resolve a specific detail a " +
    "news feed did not carry; corroborate a claim from an independent source.\n" +
    "Does not: return raw page titles and URLs for you to triage yourself, or rank " +
    "results by importance.\n\n" +
    "Use for one question at a time. For broad discovery where you want to judge many " +
    "results yourself, use webSearchTool instead - this returns an answer, not a list.",

  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "One specific question or lookup, in a single sentence. Prefer a question with a " +
          "concrete answer over a broad topic - ask what a central bank decided rather " +
          "than asking about monetary policy.",
      ),
  }),

  execute: async ({ query }) => await geminiSearch(query),
});
