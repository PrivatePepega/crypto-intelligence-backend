/**
 * Research: investigates one Triage-approved observation at a time.
 *
 * Reads the set's observations that Triage marked `research_enabled`, then loops
 * over them. Each iteration is a separate agent run with its own tools, reasoning
 * and structured record, stored in weather.research against the observation it
 * researched. Once the loop finishes, everything filed under the set is dumped to
 * JSON so the results can be read without querying.
 *
 *   npx tsx AI/weather/researcher/researcher.ts
 *
 * Artifacts:
 *   AI/data/Weather Researcher/Weather Researcher-NNN.json            the run log, as for the other agents
 *   AI/data/database Fetcher/researcher/research-<date>-<domain>.json  what landed in the database
 */

import { Output, generateText, isStepCount } from "ai";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import pool from "../../../config/database.js";

import { models } from "../../providers/model.js";

import { getReasoningText, modelIdOf, normalizeStep } from "../../utils/agent.js";
import { getAgenticTooling, estimateTokens } from "../../utils/general.tools.js";
import {
  fetchResearchForSet,
  fetchResearchQueue,
  insertResearch,
  type ResearchTarget,
  type StoredResearch,
} from "../../utils/weather/dbFetcher.researcher.js";
import {
  AGENT_NAME,
  collectResearchEvidence,
  createResearcherRunLog,
  parseResearchRecord,
  recordPrompt,
  researchPrompt,
  researchSchema,
  writeResearchDump,
  type ResearchRecord,
} from "../../utils/weather/researcher.js";
import { getDailySet, type DailySet } from "../../utils/weather/observations.js";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

/**
 * The model that researches.
 *
 * Defaults to Google rather than Groq, which Triage uses. The difference is the
 * tool schema: a research call carries nine tool definitions plus the system
 * prompt, which on Groq's on-demand tier already exceeds the 8000 tokens-per-minute
 * limit on the first request of the first observation and fails outright. Triage
 * gets away with Groq only because it makes one small call with no tools.
 *
 * Change it here and nothing else.
 */
const modelPick = models.openrouterFree;

/**
 * Ceiling on observations researched per invocation.
 *
 * One research run is a full agent loop with tools, so a large queue costs real
 * time and tokens. This bounds a single invocation; the queue itself is
 * untouched, so the next run picks up where this one stopped rather than
 * re-researching what already has a record.
 */
const MAX_LOOP = 5;

/**
 * Pause between observations, in milliseconds.
 *
 * Each observation is a full agent run with tools, so a batch is a burst of
 * back-to-back calls against the same provider and the same news APIs. The pause
 * keeps the run inside rate limits and leaves room for a provider to cool down,
 * which matters most on the free tiers where a burst is what trips the limit.
 *
 * Skipped after the final observation, so a run is not held open for nothing.
 */
const STEP_DELAY_MS = 4_000;

/**
 * Ceiling on tool-calling steps within one observation's run.
 *
 * The AI SDK's own `stepCount` stops condition. Research is one question, so this
 * bounds how far the agent may wander gathering evidence.
 */
const MAX_AGENT_STEPS = 2;

/**
 * Ceiling on one research run's output tokens.
 *
 * Generous because the response carries the full record - finding, evidence,
 * sources, context and uncertainty - and a truncated record is a hollow one. A
 * `length` finish is caught and recorded rather than stored.
 */
const MAX_OUTPUT_TOKENS = 30_000;

/**
 * Reasoning effort for each research run.
 *
 * Higher than Triage's. Triage judges a fixed list against a bar; Research has
 * to weigh conflicting evidence and decide what is actually established, which is
 * the kind of task where reasoning earns its cost. See triage.ts for why this was
 * not the default.
 */
const REASONING_EFFORT = "medium" as const;

/**
 * Tools available to a research run.
 *
 * Named from the shared registry rather than bundled wholesale: Research needs
 * evidence gathering, not the Observer's broad discovery sweep, and an unused
 * tool in the schema is an invitation to wander.
 */
const RESEARCH_TOOLS = [
  "webSearchTool",
  "currentsNewsSearch",
  "newsflashSearchArticles",
  "newsflashGetEvents",
  "gdeltSearchStories",
  "gdeltSearchEvents",
  "marketauxNewsSearch",
  "fmpGetArticlesList",
  "wabbleImportantHeadlineSearch",
] as const;

/**
 * Markers left in the stored record prompt where a large embedded value was
 * removed.
 *
 * The record prompt inlines the observation and the whole evidence blob as text.
 * Storing that rendered prompt would put a second copy of every tool result inside
 * a string, where it reads as JSON-shaped text rather than JSON, and the evidence
 * alone would be most of the entry. Each value is recorded once, so the stored
 * prompt keeps these markers and the prompt can be rebuilt by substituting the
 * recorded values back in.
 */
const OBSERVATION_MARKER = "{{observation}}";

const EVIDENCE_MARKER = "{{researchEvidence}}";

// --------------------------------------------------
// Prompts
// --------------------------------------------------

const researchSystemPrompt = `
You are the Research agent in a market intelligence pipeline.

Pipeline:
Observer = broad signal discovery
Triage = important-signal labeling
Research = investigation of individual signals
Lead = daily brief synthesis

Your job is to investigate ONE observation at a time.

You will receive a single observation that Triage determined is important enough to research.

Your sole responsibility is to determine what is actually known about that observation, gather relevant evidence, and produce a concise research record that downstream agents can use.

You are NOT the Observer.
You are NOT Triage.
You are NOT the Lead.

Do not search broadly for unrelated news.
Do not research the entire market.
Do not generate a daily narrative.
Do not combine unrelated events.
Do not decide what other observations should be researched.

Research ONLY the observation provided.

1. UNDERSTAND THE OBSERVATION

Treat the observation as a research lead, not established fact.

It may be:
- a headline
- a reported event
- a market movement
- a regulatory development
- an institutional action
- a security incident
- a company or protocol development
- a narrative or claim
- an unusual deterministic condition

Determine what the observation is actually claiming before investigating it.

2. INVESTIGATE THE SIGNAL

Use the available research tools to find reliable evidence about the specific observation.

Prioritize:
- primary sources
- official government or regulatory sources
- official company, protocol, or project announcements
- filings and official documents
- reputable reporting
- multiple independent sources when appropriate

Use broad sources when they help establish what happened, but keep the research focused on the observation.

Do not search simply to accumulate sources.

3. ESTABLISH WHAT HAPPENED

Determine:
- what happened
- who or what was involved
- when it happened
- where or which market it affects
- the current status of the event
- whether the original observation is supported, partially supported, misleading, or unconfirmed

Separate verified facts from claims, interpretation, and uncertainty.

Do not assume that a headline is correct simply because it was reported.

4. EVIDENCE

Gather the strongest evidence needed to establish the event.

Prefer primary evidence over commentary.

When multiple sources report the same event, use them to corroborate the event rather than repeating the same information.

If reliable sources disagree, explicitly identify the disagreement.

Do not manufacture certainty when the available evidence is incomplete.

5. CONTEXT

Provide only context that helps understand the researched observation.

Do not turn the research into a general topic overview.

Do not investigate unrelated developments unless they are directly necessary to understand the observation.

6. CAUSATION AND INTERPRETATION

Do not claim that one event caused another unless the evidence supports that relationship.

Clearly distinguish:
- confirmed facts
- reported claims
- reasonable interpretation
- unknowns

If the cause is unknown, say so.

If the market significance is uncertain, say so.

Do not manufacture an explanation simply because the observation appears to require one.

7. RESEARCH QUALITY

Research deeply enough to establish the event, but stop once the important facts are sufficiently supported.

The goal is not maximum research volume.

The goal is reliable, useful evidence.

Avoid:
- repetitive searches
- duplicate sources
- low-quality aggregators
- SEO articles
- unsupported social-media claims
- speculation presented as fact
- unrelated information

8. OUTPUT

Return a structured research record for THIS observation only.

The record contains:

- summary: a standalone, understandable summary of the researched observation in 1–2 sentences. Synthesize the most important information from the finding, context, and uncertainty. Explain what happened or was discovered, why it matters when relevant, and any critical caveat that changes how the finding should be interpreted. Preserve important figures and distinguish confirmed facts from claims or theoretical results. The summary must make sense without reading the other fields. Do not introduce information that is unsupported by the research.
- finding: what the research establishes
- evidence: the strongest supporting evidence
- sources: the relevant sources used
- context: important context needed to understand the event
- uncertainty: unresolved questions, conflicting evidence, or limitations
- status: one of supported, partially_supported, disputed, or unconfirmed

Keep the research focused and factual.

Do not write the daily brief.
Do not rank the observation against other observations.
Do not recommend what the Lead should write.

Your job is simple:

TAKE ONE SIGNAL.
INVESTIGATE IT.
ESTABLISH WHAT IS ACTUALLY KNOWN.
SUPPORT IT WITH EVIDENCE.
MAKE UNCERTAINTY EXPLICIT.
RETURN THE RESEARCH.
`;

// --------------------------------------------------
// Research
// --------------------------------------------------

export type ResearchOutcome = {
  date: string;
  marketDomain: string;
  intelligenceSetId: string;
  /** Observations Triage had enabled when this run started. */
  queued: number;
  /** Observations this run actually attempted, capped by MAX_LOOP. */
  attempted: number;
  /** Research records stored by this run. */
  researched: number;
  /** Observations whose research failed, by observation id. */
  failedIds: string[];
  /** Research rows now filed under the set, including earlier runs. */
  totalInSet: number;
  dumpFile: string;
};

/** One observation's outcome, used only to build the return value. */
type Attempted = {
  observationId: string;
  stored: boolean;
};

/**
 * Researches up to MAX_LOOP of the set's Triage-approved observations.
 *
 * `marketDomain` narrows the queue; `null` takes every enabled domain in the set.
 *
 * The loop continues past a failed observation rather than aborting the batch: a
 * single unresearchable lead should not cost the other fourteen their research.
 * Failures are recorded per observation and reported in the outcome, so a partial
 * pass is visible rather than silent.
 *
 * One run log covers the whole invocation, holding a section per observation. The
 * per-observation research is also stored in weather.research, which is the record
 * that survives the process.
 */
export const runResearcher = async (
  intelligenceSet: DailySet,
  marketDomain: string | null,
): Promise<ResearchOutcome> => {
  console.log(
    `[research] Research run initialized for domain: ${marketDomain ?? "all-domains"} - ` +
      `set ${intelligenceSet.id} (${intelligenceSet.set_date})`,
  );

  const runLog = await createResearcherRunLog();

  const queue = await fetchResearchQueue(intelligenceSet, marketDomain);

  const targets = queue.slice(0, MAX_LOOP);

  await runLog.record("initializer", {
    date: intelligenceSet.set_date,

    marketDomain,

    intelligenceSetId: intelligenceSet.id,

    model: modelIdOf(modelPick),

    maxLoop: MAX_LOOP,

    maxAgentSteps: MAX_AGENT_STEPS,

    maxOutputTokens: MAX_OUTPUT_TOKENS,

    reasoningEffort: REASONING_EFFORT,

    tools: RESEARCH_TOOLS,

    // Truncation is reported per observation, so a run that did less than the
    // loop allows says whether that was the cap or a shortage of work.
    queued: queue.length,
    attempted: targets.length,
  });

  const attempts: Attempted[] = [];
  const failedIds: string[] = [];
  const truncatedIds: string[] = [];

  // Observation stored most recently, so a dump can say which record prompted it.
  let latestObservationId: string | null = null;

  // --------------------------------------------------
  // Dump what the database holds for this set
  // --------------------------------------------------

  /**
   * Re-reads the set's research and writes it to the dump file.
   *
   * Declared before the loop because the loop calls it after every stored
   * observation. Reads rather than reusing the loop's own values, so the dump is a
   * record of what actually committed: a row the insert rejected appears as
   * missing rather than being reported as researched. That also means the file
   * carries earlier runs' research for the same set, which is the point - it is the
   * set's research, not one run's slice.
   */
  const dumpDatabase = async (latestObservationId: string | null): Promise<string> => {
    const stored = await fetchResearchForSet(intelligenceSet);

    return await writeResearchDump({
      agentName: AGENT_NAME,

      runNumber: runLog.runNumber,

      date: intelligenceSet.set_date,

      marketDomain: marketDomain ?? "all-domains",

      intelligenceSetId: intelligenceSet.id,

      latestObservationId,

      rows: stored,
    });
  };

  // Two model calls per observation.
  //
  // Phase one gathers evidence with tools. Phase two turns that evidence into the
  // record, with no tools and the schema attached.
  //
  // The split is forced by the provider, not chosen for tidiness: Groq rejects
  // JSON mode combined with tool calling, so a single call cannot both use tools
  // and return a schema-validated record. Attempting it fails the request outright
  // with `json mode cannot be combined with tool/function calling`. The Observer
  // solves the same problem the same way.
  for (const [index, target] of targets.entries()) {
    // Position in the batch, so every later entry can be attributed to an
    // observation when steps from several runs share one log.
    const step = index + 1;

    await runLog.record("observation", {
      step,

      observationId: target.id,

      type: target.type,

      prompt: researchPrompt(target),
    });

    // --------------------------------------------------
    // Phase one: gather evidence
    // --------------------------------------------------

    // `generateText`, not `streamText`: the Observer streams because it wants
    // callbacks while it wanders through tools, but nothing here parses this
    // phase's output, and a streamed response that arrives truncated loses
    // evidence silently. Per-step callbacks work the same either way.
    const researchResult = await generateText({
      model: modelPick,

      instructions: researchSystemPrompt,

      prompt: researchPrompt(target),

      tools: getAgenticTooling({ tools: [...RESEARCH_TOOLS] }),

      stopWhen: isStepCount(MAX_AGENT_STEPS),

      maxOutputTokens: MAX_OUTPUT_TOKENS,

      providerOptions: { groq: { reasoningEffort: REASONING_EFFORT } },

      onStepEnd: async (stepResult) => {
        await runLog.record("step", { step, ...normalizeStep(stepResult) });
      },
    });

    const researchText = researchResult.text;

    const researchSteps = await researchResult.steps;
    const researchUsage = await researchResult.totalUsage;

    // Recorded per observation because the failure modes differ: `length` means
    // the evidence-gathering was cut off, `content-filter` means the provider
    // blocked it, `stop` means the model finished.
    const researchFinishReason = researchResult.finishReason;

    await runLog.record("research_output", {
      step,
      observationId: target.id,
      text: researchText,
    });

    let lastReasoningText: string | null = null;

    for (const stepResult of researchSteps) {
      const reasoningText = getReasoningText(stepResult);

      if (reasoningText) {
        lastReasoningText = reasoningText;
      }
    }

    await runLog.record("reasoning", {
      step,
      observationId: target.id,
      reasoning: lastReasoningText,
    });

    // The evidence handed to phase two. Serialized once and reused for the prompt,
    // the token estimate and the run log, so all three describe the same bytes and
    // the log can strip it back out and rebuild the prompt exactly.
    const embeddedEvidence = JSON.stringify(collectResearchEvidence(researchSteps), null, 2);

    const embeddedContextTokens = estimateTokens(embeddedEvidence);

    // Nothing to format. A research phase that stopped on a token ceiling
    // produced a fragment, and asking a model to turn a fragment into a confident
    // record would manufacture certainty that was never gathered.
    if (researchFinishReason === "length") {
      truncatedIds.push(target.id);

      await runLog.record("research_failure", {
        step,
        observationId: target.id,
        stage: "research",
        error: `Evidence gathering was cut off (finishReason: length). ${researchText.length} characters gathered.`,
        characters: researchText.length,
        finishReason: researchFinishReason,
        embeddedContextTokens,
      });

      attempts.push({ observationId: target.id, stored: false });
      failedIds.push(target.id);

      continue;
    }

    // --------------------------------------------------
    // Phase two: format the record
    // --------------------------------------------------

    // No tools on this call, so structured output is available and the record's
    // shape is enforced by the schema rather than by the model picking key names.

    const recordResult = await generateText({
      model: modelPick,
    
      instructions: `
    You are a strict research-record formatter.
    
    Your ONLY task is to transform the supplied research evidence into
    one object matching the provided research_record schema.
    
    The schema is the authoritative contract. Follow its field names and
    types exactly. Do not invent, rename, omit, or add fields.
    
    Required fields:
    - finding: string
    - evidence: string
    - sources: array of strings
    - context: string
    - uncertainty: string
    - status: "supported" | "partially_supported" | "disputed" | "unconfirmed"
    
    Rules:
    - Do not output a summary field.
    - Do not output observation_id or verified_facts.
    - Do not substitute different field names.
    - Do not return Markdown or wrap the object in a code fence.
    - Every required field must be present.
    - If the research lacks information for a field, state that limitation
      explicitly rather than inventing facts.
    - The status must reflect the evidence, not the original observation's wording.
    - Add no facts that are not supported by the supplied research.
    `,
    
      prompt: recordPrompt(target, embeddedEvidence),
    
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    
      providerOptions: {
        groq: { reasoningEffort: REASONING_EFFORT },
        openrouter: {
          // Leave provider-specific options out unless supported by this model.
        },
      },
    
      output: Output.object({
        schema: researchSchema,
        name: "research_record",
        description:
          "A strict research record with finding, evidence, sources, context, uncertainty, and status. No additional fields.",
      }),
    });

    const recordText = recordResult.text;

    const recordFinishReason = recordResult.finishReason;

    await runLog.record("record_output", {
      step,
      observationId: target.id,

      // The evidence is recorded once above, so the stored prompt keeps markers
      // in its place rather than repeating every tool result as text.
      prompt: recordPrompt(target, embeddedEvidence)
        .replace(target.observation, OBSERVATION_MARKER)
        .replace(embeddedEvidence, EVIDENCE_MARKER),

      embeddedValues: {
        [OBSERVATION_MARKER]: "the observation row's text, verbatim",
        [EVIDENCE_MARKER]: "JSON.stringify(research evidence, null, 2) over phase-one steps",
      },

      embeddedContextTokens,
    });

    await runLog.record("usage", {
      step,

      observationId: target.id,

      researchPhase: {
        // Summed across the phase's steps, so this is a running total rather than
        // any one step's context.
        cumulativeInputTokens: researchUsage.inputTokens ?? null,

        outputTokens: researchUsage.outputTokens ?? null,

        // One request per step; each input is the context that step was sent.
        stepInputTokens: researchSteps.map((stepResult) => {
          const usage = stepResult.usage as { inputTokens?: number } | undefined;

          return usage?.inputTokens ?? null;
        }),

        steps: researchSteps.length,

        finishReason: researchFinishReason,
      },

      // A single call, so this input is that one call's context rather than a
      // total across steps.
      recordPhaseInputTokens: recordResult.usage.inputTokens ?? null,

      recordPhaseOutputTokens: recordResult.usage.outputTokens ?? null,

      recordFinishReason,
    });

    if (recordFinishReason === "length") {
      truncatedIds.push(target.id);
    }

    // Parse before inserting, so a malformed record never reaches the database.
    // The SDK's schema-validated output is preferred; the text parse is the
    // fallback, and which one was used is recorded.
    let record: ResearchRecord;
    let parseSource: "output (schema-validated)" | "text (fallback)";

    try {
      const structured = recordResult.output as ResearchRecord | undefined;

      if (structured) {
        record = structured;
        parseSource = "output (schema-validated)";
      } else {
        record = parseResearchRecord(recordText);
        parseSource = "text (fallback)";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await runLog.record("research_failure", {
        step,
        observationId: target.id,
        stage: "parse",
        error: message,
        characters: recordText.length,
        finishReason: recordFinishReason,
        text: recordText,
      });

      attempts.push({ observationId: target.id, stored: false });
      failedIds.push(target.id);

      continue;
    }

    // Stored as JSON text. The observation's own columns are copied from the
    // observation row rather than echoed by the model, so the two cannot drift.
    const storedResearch = await insertResearch(
      intelligenceSet,
      target,
      JSON.stringify(record, null, 2),
    );

    attempts.push({ observationId: target.id, stored: true });

    latestObservationId = target.id;

    await runLog.record("research", {
      step,

      observationId: target.id,

      parseSource,

      researchFinishReason,

      recordFinishReason,

      truncated: recordFinishReason === "length",

      embeddedContextTokens,

      storedResearchId: storedResearch,

      record,
    });

    // The dump follows each research rather than waiting for the batch to end, so
    // the folder reflects the database as each record lands. If this run dies on
    // the next observation, what got this far is already there.
    await dumpDatabase(latestObservationId);

    // Between observations, not after the last one. Placed here rather than at the
    // top of the loop so the pause always follows real work: an iteration that
    // threw has already left the loop, and there is nothing to wait before.
    const isLastObservation = index === targets.length - 1;

    if (!isLastObservation && STEP_DELAY_MS > 0) {
      console.log(`[research] waiting ${STEP_DELAY_MS / 1000}s before the next observation`);

      await sleep(STEP_DELAY_MS);
    }
  }

  // Once more at the end, covering an observation that failed to store, and in a
  // `finally` so a throw anywhere in the loop still leaves a dump of whatever
  // committed. A model or provider error used to skip this entirely, which is the
  // worst moment to be missing it.
  let dumpFile = "";

  let stored: StoredResearch[] = [];

  try {
    dumpFile = await dumpDatabase(latestObservationId);

    stored = await fetchResearchForSet(intelligenceSet);

    // finish() here, so the raw responses are on disk before anything can throw.
    await runLog.finish();
  } finally {
    // Belt and braces: if `dumpDatabase` or `finish` threw, make one more attempt
    // so a partial run still leaves something to read.
    if (dumpFile === "") {
      dumpFile = await dumpDatabase(latestObservationId).catch(() => "");

      stored = await fetchResearchForSet(intelligenceSet).catch(() => stored);
    }
  }

  await runLog.record("summary", {
    date: intelligenceSet.set_date,

    marketDomain,

    queued: queue.length,

    attempted: attempts.length,

    researched: attempts.filter((attempt) => attempt.stored).length,

    failedIds,

    truncatedIds,

    totalInSet: stored.length,

    dumpFile,
  });

  const researchedCount = attempts.filter((attempt) => attempt.stored).length;

  console.log(
    `[research] Research run finalized for domain: ${marketDomain ?? "all-domains"} - ` +
      `queued ${queue.length}, researched ${researchedCount}, ` +
      `${failedIds.length} failed, ${stored.length} row(s) in set`,
  );

  return {
    date: intelligenceSet.set_date,
    marketDomain: marketDomain ?? "all-domains",
    intelligenceSetId: intelligenceSet.id,
    queued: queue.length,
    attempted: attempts.length,
    researched: researchedCount,
    failedIds,
    totalInSet: stored.length,
    dumpFile,
  };
};

// --------------------------------------------------
// Entry point
// --------------------------------------------------

/**
 * Domain researched when this file is run directly.
 *
 * A direct run has to name one: research follows triage's per-domain split, so
 * there is no sensible default and guessing one would quietly research the wrong
 * set. Change this to research another domain by hand, or call `runResearcher`
 * from the pipeline instead.
 */
const DIRECT_RUN_DOMAIN: string | null = "crypto";

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  // Resolved the same way the pipeline does, so a direct run researches the same
  // set a pipeline run would.
  getDailySet()
    .then((intelligenceSet) => runResearcher(intelligenceSet, DIRECT_RUN_DOMAIN))
    .then((outcome) => {
      console.log(
        `${outcome.date} ${outcome.marketDomain} (set ${outcome.intelligenceSetId}): ` +
          `queued ${outcome.queued}, attempted ${outcome.attempted}, ` +
          `researched ${outcome.researched}, failed ${outcome.failedIds.length}. ` +
          `Set total ${outcome.totalInSet}. Dump -> ${outcome.dumpFile}`,
      );
    })
    .catch((error: unknown) => {
      console.error("Research failed:", error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
