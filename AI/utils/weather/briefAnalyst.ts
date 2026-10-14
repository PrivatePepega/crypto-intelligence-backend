import { isStepCount, streamText, type LanguageModel } from "ai";
import { z } from "zod";

import { modelIdOf } from "../agent.js";

import {
  AGENT_RUN_LOG_DIR,
  createAgentRunLog,
  createSilentAgentRunLog,
  type AgentRunLog,
} from "../logger.js";

import { extractJsonObject } from "./observations.js";
import { withModelRetry } from "./retry.js";

// --------------------------------------------------
// Brief Analyst
// --------------------------------------------------
//
// The brief's data contract: what the analyst and formatter are working toward,
// and the switch that controls whether either writes to disk.
//
// ## The shape is provisional
//
// These early runs exist to see what the model actually produces before the
// structure is fixed. So the inner items are `looseObject` with a handful of
// optional known fields: the formatter is nudged toward a shape, but nothing it
// was not asked to remove is stripped. Fields the model invents survive into the
// artifact, which is the whole point - they are the evidence for what the real
// schema should be.
//
// Tighten the inner objects once the runs have shown what is stable. Do that
// before anything reads these fields programmatically, because a schema that
// changes shape between runs makes two artifacts incomparable.
// --------------------------------------------------

// --------------------------------------------------
// Artifacts
// --------------------------------------------------

/** This agent's name. Names the run-log folder and file. */
export const AGENT_NAME = "Weather Brief Analyst";

/**
 * Whether the Brief Analyst keeps its JSON run log.
 *
 * Set this to `false` and nothing is written to AI/data: no run log under
 * `Weather Brief Analyst/`. Nothing else changes - there is no database write yet,
 * so this is purely the diagnostic artifact.
 *
 * Comment the line out to disable it.
 *
 * Left `true` because the run log is currently the *only* output. The analyst's
 * reasoning, its tool calls, its raw analysis and the formatter's normalized brief
 * all live here, and nothing is persisted anywhere else until the table is built.
 */
export const BRIEF_ARTIFACTS = true;

/**
 * The Brief Analyst's run log, or a no-op stand-in when artifacts are off.
 *
 * Returns the same type either way, so no agent code changes shape when the
 * switch flips.
 *
 * Both phases are recorded into this one file. The analyst's raw analysis and the
 * formatter's normalized brief are two views of the same run, and keeping them
 * together means a brief can be read next to the reasoning that produced it.
 */
export const createBriefAnalystRunLog = async (marketDomain: string): Promise<AgentRunLog> => {
  return BRIEF_ARTIFACTS
    ? await createAgentRunLog(AGENT_NAME, marketDomain)
    : createSilentAgentRunLog(AGENT_NAME, marketDomain);
};

/** Where the run log lives, for the agent's header comment. */
export const BRIEF_RUN_LOG_DIR = AGENT_RUN_LOG_DIR;

/**
 * Inserts a comma omitted between two object properties.
 *
 * The analyst runs with tools and so cannot be given a schema - it emits JSON as
 * free text, and has been observed dropping the comma between two properties.
 * The run 001 output has exactly one such break, at position 29,541:
 *
 * ```
 * ...no single driver explains all."  "relationships_and_market_implications": [
 * ```
 *
 * One comma, and all ten top-level keys parse.
 *
 * This matters because a model asked to *edit* valid JSON does the small job,
 * while one handed broken JSON spends its budget trying to *recover* it first -
 * which produced 70,000+ character responses that never terminated.
 *
 * Only that one defect is repaired, and only where a `"key":` genuinely follows a
 * complete value. The result is re-parsed before being accepted, so a wrong guess
 * is discarded rather than passed on. Anything worse returns `null` and the caller
 * keeps the original.
 *
 * @returns The repaired text and where the change was made, or `null`.
 */
export const repairMissingSeparator = (
  text: string,
): { text: string; at: number; context: string } | null => {
  try {
    JSON.parse(text);

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const match = /position (\d+)/.exec(message);

    if (match === null) {
      return null;
    }

    const at = Number(match[1]);

    if (!/^\s*"[A-Za-z_][A-Za-z0-9_]*"\s*:/.test(text.slice(at))) {
      return null;
    }

    const repaired =
      text.slice(0, at).replace(/\s*$/, "") + ", " + text.slice(at).replace(/^\s*/, "");

    try {
      JSON.parse(repaired);
    } catch {
      return null;
    }

    return {
      text: repaired,
      at,
      context: text.slice(Math.max(0, at - 50), at + 50),
    };
  }
};

// --------------------------------------------------
// Brief generation
// --------------------------------------------------
//
// One implementation shared by every brief written from an analyst output.
//
// The human brief and the AI context brief are different documents built from the
// same evidence, and they differ only in their prompts. The model, the streaming,
// the repair and the parsing are therefore written once here: two copies would be
// two places for them to drift apart, and a brief that parses in one would not in
// the other.
// --------------------------------------------------

/**
 * One brief's knobs.
 *
 * Declared by the caller, not here, so each agent's slider panel is its own code and
 * the two briefs can differ. `generateBrief` only carries them out.
 */
export type BriefSliders = {
  /** The model that writes this brief. */
  model: LanguageModel;

  /**
   * Ceiling on model steps.
   *
   * The briefs carry no tools, so a run is a single step and this never bites. It is
   * still wired up so the knob means the same thing as the analyst's step ceiling, and
   * so it starts working the moment a tool is added to a brief.
   */
  maxSteps: number;

  /**
   * Ceiling on output tokens, or `undefined` for none.
   *
   * `undefined` is the default for both briefs and should stay that way. A ceiling is
   * a target the model writes *toward* rather than headroom it needs: earlier runs
   * finished at exactly their ceiling, producing briefs cut off mid-sentence.
   */
  maxOutputTokens: number | undefined;

  /**
   * Reasoning effort, and the provider it is addressed to. `undefined` sends no
   * reasoning option at all.
   *
   * Provider-specific by nature - the SDK has no cross-provider reasoning-effort
   * option, only `providerOptions` keyed by provider name - so the slider names both.
   * Setting one for a provider that is not in the path is not a harmless no-op: it
   * was previously sent as `{ groq: { reasoningEffort } }` to a non-Groq provider and
   * that model then returned a `reasoning` block and no text at all.
   */
  reasoningEffort: { provider: string; effort: "low" | "medium" | "high" } | undefined;

  /**
   * Total attempts for this brief's model call, including the first.
   *
   * Part of the sliders rather than a global because each brief's budget is its own
   * decision - the human brief and the AI context brief are separate documents and can
   * be given different patience.
   */
  retryAttempts: number;

  /**
   * Wait between attempts for this brief's model call, in milliseconds.
   *
   * `generateBrief` is shared by both briefs, so without a per-brief value the only
   * way to change this would be to edit the shared function - which would change it
   * for every caller at once, including any future one.
   */
  retryDelayMs: number;
};

// --------------------------------------------------
// Response checks
// --------------------------------------------------
//
// Every brief stage has produced a response the provider considered finished and
// that contained no brief at all. A blank check catches none of them:
//
// - "User Safety: safe" - 17 characters, `finishReason: stop`, no braces
// - a truncated document that stops mid-value, braces still open
// - prose instead of JSON
//
// All three arrive as a *successful* response, so without a check the stage either
// writes an empty brief or throws at the parse with the real cause - a provider
// safety stub or a shed connection - nowhere in sight.
// --------------------------------------------------

/**
 * How many attempts a brief stage gets when the response is not a brief.
 *
 * Separate from the outage budget in {@link BriefSliders} because the two failures
 * are unrelated: that one waits out a provider being unreachable, this one re-asks
 * a provider that answered with something that is not a brief. Waiting eight
 * minutes for a fourth identical safety stub only delays the same failure.
 */
const BRIEF_ATTEMPTS = 3;

/**
 * What each attempt is told, escalating.
 *
 * An identical prompt tends to produce an identical response, and these failures
 * are not the kind a model escapes on its own. Each attempt gets different
 * instructions naming what was wrong with the one before.
 */
const BRIEF_RETRY_INSTRUCTIONS = [
  "please do it right",
  "Your previous response was not a brief. Return the complete JSON object for this brief, and nothing else - no preamble, no explanation, no markdown fence.",
  "Two previous responses were unusable. Emit the full JSON object now, opening with { and closing with }. Do not stop early, do not summarise, and do not add commentary outside the object.",
] as const;

/**
 * Whether a brief stage's response is actually a brief, and why not if it is not.
 *
 * Returns `null` for a response worth using, or a sentence naming the problem so the
 * retry line says which of the checks it was rather than a generic "empty result".
 *
 * Two checks, in order of how often each has caught a real run:
 *
 * 1. no JSON object at all - a provider safety stub, prose, or a response cut off
 *    before its braces closed. This is the one that fires: "User Safety: safe" and a
 *    document truncated mid-value both land here.
 * 2. a JSON object with nothing in it - `{}` parses cleanly and is not a brief
 *
 * And within the first, a genuine `JSON.parse` rather than the brace count alone:
 * `extractJsonObject` balances braces, so `{"summary": }` comes back looking complete
 * and only the parse catches it.
 *
 * @param text The response, unparsed.
 */
export const briefResponseProblem = (text: string): string | null => {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return "empty response";
  }

  const jsonText = extractJsonObject(trimmed);

  if (jsonText === null) {
    const preview = trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed;

    return (
      `no JSON object in ${trimmed.length} characters ` +
      `(response began: ${JSON.stringify(preview)})`
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return `JSON object did not parse: ${message}`;
  }

  // `extractJsonObject` only ever returns a balanced `{`...`}` slice, so anything
  // that got here is an object literal - there is no array, null or bare value case to
  // guard against, and a top-level array was already rejected above for having no
  // opening brace.
  //
  // An empty object is not a brief, though. Checked here rather than by a schema
  // because neither brief declares one: each prompt sets its own shape.
  if (Object.keys(parsed as Record<string, unknown>).length === 0) {
    return "JSON object is empty";
  }

  return null;
};

/** What one brief generation produced. */
export type BriefGenerationResult = {
  /** The parsed brief. `unknown` because each prompt sets its own shape. */
  brief: unknown;

  /** The model's text, unparsed. Kept so a failure can still be diagnosed. */
  text: string;

  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  seconds: number;

  /**
   * The sliders this run actually used.
   *
   * Recorded so a brief in a run log can be traced to the settings that produced it,
   * rather than to whatever those settings happen to be today.
   */
  model: string;
  maxOutputTokens: number | null;
  reasoningEffort: string | null;

  /** Where the analyst input needed the comma repair, or `null` when it did not. */
  repairedAt: number | null;

  /** How many attempts the brief budget needed, including the one that succeeded. */
  briefAttempts: number;
};

/**
 * Generates one brief from an analyst output.
 *
 * Writes nothing. Recording the result is the caller's job, because each brief is
 * recorded under its own sections of the one run log.
 *
 * @throws When the response contains no JSON object. The text is in the run log
 *   either way, so a failed brief is still diagnosable.
 */
export const generateBrief = async (options: {
  /** The analyst's response. Repaired here when it is one dropped comma away from
   *  valid JSON, so the brief model is handed something it can edit rather than spend
   *  its budget recovering. */
  analystOutput: string;

  /** Reported in the lifecycle lines so the output names the right domain. */
  domain: string;

  /** Names this brief in the lifecycle lines, e.g. `Human brief`. */
  label: string;

  /** The brief's editorial or synthesis instructions. */
  systemPrompt: string;

  /**
   * Built from the same analyst output.
   *
   * Appended to on a re-ask rather than replaced, so the retry instructions sit after
   * the editorial instructions and are the last thing the model reads.
   */
  userPrompt: string;

  /** The model, step ceiling, token ceiling and reasoning effort to use. */
  sliders: BriefSliders;
}): Promise<BriefGenerationResult> => {
  const { analystOutput, domain, label, systemPrompt, userPrompt, sliders } = options;

  console.log(
    `[brief] ${label} initialized for domain: ${domain} - ` +
      `${analystOutput.length} characters of analyst output, ` +
      `model=${modelIdOf(sliders.model)} ` +
      `maxSteps=${sliders.maxSteps} ` +
      `maxOutputTokens=${sliders.maxOutputTokens ?? "none"} ` +
      `reasoningEffort=${
        sliders.reasoningEffort
          ? `${sliders.reasoningEffort.provider}/${sliders.reasoningEffort.effort}`
          : "none"
      }`,
  );

  const repair = repairMissingSeparator(analystOutput);

  let input = analystOutput;

  if (repair !== null) {
    console.log(`[brief] ${label} repair: inserted one missing comma at ${repair.at}`);

    input = repair.text;
  }

  // How many of the brief budget this run spent, and what the last rejected response
  // was. Both recorded in the result so a run that needed re-asking is visible
  // afterwards rather than only in the console.
  let briefAttempts = 0;

  /** The instruction for the next attempt, advancing the counter. */
  const nextRetryInstruction = (): string => {
    briefAttempts += 1;

    const index = Math.min(briefAttempts, BRIEF_RETRY_INSTRUCTIONS.length) - 1;

    return BRIEF_RETRY_INSTRUCTIONS[index] ?? BRIEF_RETRY_INSTRUCTIONS[0];
  };

  /** Why the last response was rejected, or null when it was accepted. */
  let shapeProblem: string | null = null;

  // Retried, and a response that is not a brief counts as a failure. Covers both
  // briefs at once, because they share this function and the failure they would
  // suffer is identical.
  //
  // The whole call rather than the stream: `streamText` is lazy, so the request is not
  // made until the text is consumed, and a stream that has started emitting cannot be
  // resumed. A brief that came back empty would otherwise fail at the JSON parse, with
  // the real cause - an overloaded provider - nowhere in sight.
  // Started once for the whole retried run, not per attempt, so the reported elapsed
  // time includes the backoff between attempts rather than hiding it.
  const startedAt = Date.now();

  const runStream = async (prompt: string) => {
    const stream = streamText({
      model: sliders.model,

      system: systemPrompt,

      prompt,

      // Inert without tools, but wired so the knob is real rather than decorative.
      stopWhen: isStepCount(sliders.maxSteps),

      // Spread rather than passed as `undefined`: the project compiles with
      // `exactOptionalPropertyTypes`, which distinguishes "absent" from "explicitly
      // undefined". Omitting the key is what actually leaves the option off.
      ...(sliders.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: sliders.maxOutputTokens }),
      ...(sliders.reasoningEffort === undefined
        ? {}
        : {
            providerOptions: {
              [sliders.reasoningEffort.provider]: {
                reasoningEffort: sliders.reasoningEffort.effort,
              },
            },
          }),
    });

    let received = 0;

    // Fires even while the SDK is retrying, so a retry is never mistaken for a hang.
    const heartbeat = setInterval(() => {
      console.log(
        `     [waiting] ${Math.round((Date.now() - startedAt) / 1000)}s elapsed, ` +
          `${received} characters received`,
      );
    }, 10_000);

    try {
      for await (const delta of stream.textStream) {
        received += delta.length;
      }
    } finally {
      clearInterval(heartbeat);
    }

    const usage = await stream.usage;

    return { text: await stream.text, finishReason: await stream.finishReason, usage };
  };

  /**
   * Asks for the brief, re-asking with different instructions when the answer is not
   * one.
   *
   * This is the shape budget and nothing else. A provider error is deliberately not
   * caught here: it leaves straight out to the outage wrapper below rather than
   * consuming one of three attempts.
   *
   * The exhausted case returns the last response rather than throwing, so the wrapper
   * outside does not spend eight minutes repeating the same three failures.
   * `shapeProblem` is what turns it into a failure instead.
   */
  const askForBrief = async () => {
    let lastRun: Awaited<ReturnType<typeof runStream>> | undefined;

    for (let attempt = 1; attempt <= BRIEF_ATTEMPTS; attempt += 1) {
      const instruction = nextRetryInstruction();

      const run = await runStream(`${userPrompt}\n\n${instruction}`);

      lastRun = run;

      const problem = briefResponseProblem(run.text);

      if (problem === null) {
        shapeProblem = null;

        return run;
      }

      shapeProblem = problem;

      console.warn(
        `↻ ${label} (${domain}) response ${attempt}/${BRIEF_ATTEMPTS} rejected: ${problem}`,
      );
    }

    if (lastRun === undefined) {
      throw new Error(`${label} made no attempts`);
    }

    return lastRun;
  };

  // The outage budget, and only that. `askForBrief` is re-run whole on a provider
  // failure because a started stream cannot be resumed, and it carries no shape check
  // of its own so a rejected response is not retried eight more times here.
  const { text, finishReason, usage } = await withModelRetry(askForBrief, `${label} (${domain})`, {
    attempts: sliders.retryAttempts,
    delayMs: sliders.retryDelayMs,
  });

  // Three rejected responses in a row is not a quiet day, it is a provider handing
  // back something that is not a brief. Raised here rather than left to the parse so
  // the reason is the shape problem rather than "no JSON object", which is what it
  // always says about a safety stub.
  if (shapeProblem !== null) {
    console.log(`[brief] ${label} finalized for domain: ${domain} - no brief, ${shapeProblem}`);

    throw new Error(
      `${label} did not return a brief after ${BRIEF_ATTEMPTS} attempts: ${shapeProblem} ` +
        `(finishReason=${finishReason}, ${text.length} characters).`,
    );
  }

  const seconds = Math.round((Date.now() - startedAt) / 1000);

  console.log(
    `[brief] ${label} response: finishReason=${finishReason} text=${text.length} chars in ${seconds}s ` +
      `input=${usage.inputTokens ?? "?"} output=${usage.outputTokens ?? "?"}`,
  );

  // Returns the JSON *text*, so it is parsed here. The prompts forbid fences and
  // surrounding prose, and this tolerates both rather than discarding a good brief
  // over formatting.
  const jsonText = extractJsonObject(text);

  if (jsonText === null) {
    console.log(
      `[brief] ${label} finalized for domain: ${domain} - no brief, no JSON object in the response`,
    );

    throw new Error(
      `${label} returned no JSON object (finishReason=${finishReason}, ${text.length} characters).`,
    );
  }

  console.log(
    `[brief] ${label} finalized for domain: ${domain} - ` +
      `${text.length} characters, ${(usage.outputTokens ?? 0).toLocaleString()} output tokens`,
  );

  return {
    brief: JSON.parse(jsonText) as unknown,
    text,
    finishReason,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    seconds,
    model: modelIdOf(sliders.model),
    maxOutputTokens: sliders.maxOutputTokens ?? null,
    reasoningEffort: sliders.reasoningEffort
      ? `${sliders.reasoningEffort.provider}/${sliders.reasoningEffort.effort}`
      : null,
    repairedAt: repair?.at ?? null,

    briefAttempts,
  };
};
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { agentRunFileName } from "../logger.js";

import { fetchBriefsForSet } from "./dbFetcher.brief.js";
import type { StoredBrief } from "./dbFetcher.brief.js";
import type { DailySet } from "./observations.js";

// --------------------------------------------------
// Brief dump
// --------------------------------------------------
//
// The fourth database artifact, matching the other three.
//
// Observer snapshots `weather.observations`, Triage writes its verdicts and
// Researcher dumps `weather.research`. This one reads back `weather.daily_briefs`,
// so what a brief pass actually committed can be reviewed beside the dumps of the
// three stages that fed it.
//
// Named with `agentRunFileName`, the same helper its run log uses, so a dump and the
// log describing the same run share a file name by construction rather than by two
// copies of the format agreeing.
// --------------------------------------------------

/** Where the brief dump is written, relative to AI/data. */
const BRIEF_DUMP_DIR = path.join("database Fetcher", "weather", "briefAnalyst");

export type BriefDump = {
  /** Agent name, so the file name is generated the same way the run log's is. */
  agentName: string;
  /** The run this dump belongs to. Matches the run log with the same number. */
  runNumber: number;
  /** The domain the run analysed, which is also the file name's first segment. */
  marketDomain: string;
  date: string;
  intelligenceSetId: string;
  /** The row this run wrote, or null when nothing was persisted. */
  storedBriefId: string | null;
  /** Every brief filed under the set, newest first. */
  rows: StoredBrief[];
};

/**
 * Writes `AI/data/database Fetcher/weather/briefAnalyst/<domain>-NNN.json`.
 *
 * Built from a fresh read rather than from the values the run held, so the dump
 * records what actually committed. A row the upsert rejected appears here as missing
 * rather than being reported as written, which is the same reason the researcher's
 * dump re-reads instead of reusing.
 *
 * Overwritten rather than accumulated within a run, so the file always holds the
 * current state of the set. Gaps in the sequence are not reused, so a re-run gets its
 * own file rather than replacing the last one's evidence.
 *
 * Resolves to the path written, relative to the repository root.
 */
export const writeBriefDump = async (dump: BriefDump): Promise<string> => {
  const directory = path.join(AGENT_RUN_LOG_DIR, BRIEF_DUMP_DIR);

  mkdirSync(directory, { recursive: true });

  const fileName = agentRunFileName(dump.agentName, dump.marketDomain, dump.runNumber);

  const filePath = path.join(directory, fileName);

  const relativeFile = path.relative(process.cwd(), filePath).split(path.sep).join("/");

  const document = {
    date: dump.date,
    marketDomain: dump.marketDomain,
    intelligenceSetId: dump.intelligenceSetId,
    agentName: dump.agentName,
    runNumber: dump.runNumber,
    storedBriefId: dump.storedBriefId,
    writtenAt: new Date().toISOString(),
    rowCount: dump.rows.length,
    rows: dump.rows,
  };

  writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  return relativeFile;
};

/**
 * Reads the set's briefs back and writes the dump.
 *
 * The two steps an agent would otherwise have to remember, collapsed so a caller runs
 * the Brief Analyst with one call. The read is separate from the write so the dump can
 * be regenerated for an already-finished set without re-running anything.
 *
 * @returns The path written, or `null` when the artifacts switch is off.
 */
export const dumpBriefsForSet = async (
  intelligenceSet: DailySet,
  marketDomain: string,
  runNumber: number,
  storedBriefId: string | null,
): Promise<string | null> => {
  if (!BRIEF_ARTIFACTS) return null;

  const rows = await fetchBriefsForSet(intelligenceSet);

  return await writeBriefDump({
    agentName: AGENT_NAME,
    runNumber,
    marketDomain,
    date: intelligenceSet.set_date,
    intelligenceSetId: intelligenceSet.id,
    storedBriefId,
    rows,
  });
};
// --------------------------------------------------
// The brief
// --------------------------------------------------

/**
 * One development, metric, trend, catalyst or uncertainty.
 *
 * Every field is optional and the object is loose, so the formatter normalizes
 * toward these names without being forced to invent content for a field the
 * analyst never produced - which its own instructions forbid.
 */
const briefItem = z.looseObject({
  // Shared across several item kinds: a human label, and the records it came from.
  title: z.string().optional(),
  name: z.string().optional(),

  // Present wherever there is prose worth carrying.
  summary: z.string().optional(),
  description: z.string().optional(),
  significance: z.string().optional(),
  interpretation: z.string().optional(),

  // Metrics.
  indicator: z.string().optional(),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
  unit: z.string().optional(),
  observationDate: z.string().optional(),
  comparison: z.string().optional(),

  // Catalysts: what is scheduled, and how firmly.
  event: z.string().optional(),
  date: z.string().optional(),
  dateCertainty: z.string().optional(),

  // How the evidence should be read.
  status: z.string().optional(),
  category: z.string().optional(),

  // Traceability. Preserved exactly as supplied; never invented.
  evidenceRefs: z.array(z.string()).optional(),
  sourceRefs: z.array(z.string()).optional(),
  observationRefs: z.array(z.string()).optional(),
  indicatorRefs: z.array(z.string()).optional(),
});

/**
 * The brief's structure.
 *
 * The ten top-level fields come straight from the analyst's required response
 * structure and are enforced: a brief that is missing `assessment` is not a brief.
 * Everything beneath them stays open.
 *
 * Collections are arrays even when empty, and unavailable scalars are `null`, as
 * the analyst's instructions require - so a consumer never has to distinguish
 * "none found" from "not looked at".
 */
export const briefSchema = z.object({
  // ---- provenance ----
  domain: z.string(),
  intelligenceSetId: z.string(),
  intelligenceDate: z.string(),

  // ---- the ten analytical sections ----

  /** Overall domain state and conclusions. */
  assessment: z.string(),

  /** Significant readings, changes, and their significance. */
  indicatorBrief: z.array(briefItem),

  /** Notable observations, including the ones that were never researched. */
  observationBrief: z.array(briefItem),

  /** One concise summary per research record. */
  researchBrief: z.array(briefItem),

  /** Short synthesis of the day's key developments. */
  todaySummary: z.string(),

  /** How the main developments fit together, where the evidence supports it. */
  todayNarrative: z.string(),

  /** Evidence-supported connections, and conditional future implications. */
  relationshipsAndImplications: z.array(briefItem),

  /**
   * Tone, its classification, the reasoning, and the uncertainty about it.
   *
   * An object rather than an array because a domain has one directional reading,
   * and because the prompt requires the rationale and the uncertainty to travel
   * with the classification rather than beside it somewhere else.
   */
  directionalAssessment: z.looseObject({
    classification: z.string().optional(),
    rationale: z.string().optional(),
    uncertainty: z.string().optional(),
    observedTone: z.string().optional(),
    forwardImplications: z.string().optional(),
  }),

  /** Supported future events and possible turning points. */
  upcomingCatalysts: z.array(briefItem),

  /** Conflicts, missing data, and the limits of coverage. */
  uncertaintiesAndDataQuality: z.array(briefItem),
});

export type DomainBrief = z.infer<typeof briefSchema>;

/**
 * The schema as JSON Schema, for the formatter prompt.
 *
 * The formatter is told the exact structure to normalize into, and this is that
 * structure rendered the way a prompt can carry it. Generated from `briefSchema`
 * rather than written out separately, so the prompt can never describe a different
 * schema from the one the result is validated against - which is the failure that
 * produced a `signals` array when the prompt asked for `rankings`.
 */
export const briefJsonSchema = (): string => {
  return JSON.stringify(z.toJSONSchema(briefSchema), null, 2);
};

/**
 * Pulls the analyst's JSON out of its response.
 *
 * Lenient by design: the analyst runs with tools and therefore cannot be given a
 * schema (see the Groq tools-plus-JSON-mode restriction), so its output is parsed
 * rather than validated. Its job here is only to confirm the response contains
 * something object-shaped; deciding whether the brief is *good* is the formatter's
 * job, and judging the content is a human's.
 *
 * Throws on nothing usable, so an empty or prose-only reply is visible rather than
 * silently formatted into an empty brief.
 */
export const parseAnalystBrief = (analystText: string): Record<string, unknown> => {
  const received = (text: string): string => {
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;

    return `${text.length} characters: ${JSON.stringify(preview)}`;
  };

  const json = extractJsonObject(analystText);

  if (json === null) {
    throw new Error(`Analyst response contained no JSON object. Received ${received(analystText)}`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Analyst response was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Received ${received(analystText)}`,
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Analyst response was not a JSON object. Received ${received(analystText)}`);
  }

  return parsed as Record<string, unknown>;
};

/**
 * Reports a formatter failure to the terminal, in full.
 *
 * The formatter's own error is usually the most informative thing about a failed
 * brief, and `NoObjectGeneratedError` in particular hides its cause behind a flat
 * message - the parse error that actually went wrong is on `cause`. Unwrapping it
 * here is the difference between "could not parse the response" and the provider's
 * own complaint about which field it choked on.
 *
 * `context` is spread first, so a caller can supply the domain, set and stage
 * alongside the error's own fields. The error fields come last and cannot be
 * overwritten by it.
 *
 * Logs rather than throws, so the caller decides whether the failure is fatal.
 */
export const logFormatterError = (error: unknown, context: Record<string, unknown> = {}): void => {
  // Normalized so a thrown string or a non-Error still yields name/message/stack
  // rather than three `undefined`s.
  const err = error instanceof Error ? error : new Error(String(error));

  console.error("[Brief Analyst] Formatter failed", {
    ...context,

    name: err.name,

    message: err.message,

    stack: err.stack,

    // Unwrapped one level because a provider error's cause is where the useful
    // detail lives. Left as-is when it is not an Error, since something was still
    // thrown and discarding it would lose information.
    cause:
      err.cause instanceof Error
        ? {
            name: err.cause.name,
            message: err.cause.message,
            stack: err.cause.stack,
          }
        : (err.cause ?? null),
  });
};

/**
 * Normalizes the formatter's response into a brief.
 *
 * The schema enforces the ten top-level fields and the collection types; the loose
 * inner objects mean a formatter that reorganized or extended an item is not
 * punished for it, which matters while the shape is still being decided.
 *
 * Throws rather than returning a partial, so a brief that fails validation never
 * reaches a caller as though it were complete. The formatter's raw response is in
 * the run log either way.
 */
export const parseBriefResult = (formatterText: string): DomainBrief => {
  const received = (text: string): string => {
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;

    return `${text.length} characters: ${JSON.stringify(preview)}`;
  };

  const json = extractJsonObject(formatterText);

  if (json === null) {
    throw new Error(
      `Formatter response contained no JSON object. Received ${received(formatterText)}`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Formatter response was not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Received ${received(formatterText)}`,
    );
  }

  const result = briefSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(
      `Formatter response did not match the brief schema. ${received(formatterText)}. ` +
        `Issues: ${result.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")}`,
    );
  }

  return result.data;
};
