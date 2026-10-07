import {streamText,} from "ai";

import { models } from "../../../AI/providers/model.js";

import {type ObserverConfig,} from "./observer.config.js";

import {getAgenticContext,getAgenticTooling,estimateTokens, normalizeStep,} from "../../utils/general.tools.js";

import {logAgentStart,logAgentPrompt,logAgentResearchEvidence,logAgentResearchNotes,logAgentSynthesisStart,
logAgentUsage,logAgentToolUsage,logAgentOutput,logAgentReasoning,logAgentStep,} from "../../utils/logger.js";

import {runAgentResearch,} from "../../utils/agentResearch.js";

import {createAgentRunLog,type AgentRunLog,} from "../../utils/agentRunLog.js";

// --------------------------------------------------
// Observer
// --------------------------------------------------

const MAX_AGENT_STEPS = 5;

/**
 * This agent's name.
 *
 * Used for every console heading, and for the run-log folder and file name, so
 * one value identifies the agent everywhere.
 */
const AGENT_NAME = "Weather Observer";

/**
 * Markers left in the stored synthesis prompt where a large embedded value was
 * removed.
 *
 * The synthesis prompt has to inline the research evidence as pretty-printed
 * JSON - the model reads it as text. Storing that rendered prompt would put a
 * second copy of the evidence inside a string, where it reads as JSON-shaped
 * text rather than JSON, and would make up most of the entry. The evidence is
 * already recorded as real JSON in its own entry, so the stored prompt keeps
 * these markers plus the sequence number of that entry. Substituting the
 * recorded value back in reproduces the prompt exactly.
 */
const RESEARCH_NOTES_MARKER =
  "{{researchNotes}}";

const RESEARCH_EVIDENCE_MARKER =
  "{{researchEvidence}}";

/** How the evidence is inlined, so the prompt can be rebuilt exactly. */
const RESEARCH_EVIDENCE_FORMAT =
  "JSON.stringify(researchEvidence, null, 2)";





/**
 * Runs the Observer, recording the run to a numbered log file.
 *
 * The console transcript is deliberately not captured. Every line the logger
 * prints is already recorded as a structured entry - the step logs, the
 * reasoning, the evidence, the prompt, the usage and the output all appear
 * below - so storing it repeated the entire run a second time inside strings.
 * That was the largest single part of the file and the least readable.
 * `runLog.captureConsole()` remains available for an agent that has no
 * structured equivalent.
 */
export const runObserver = async (
  config: ObserverConfig,
) => {
  const runLog =
    await createAgentRunLog(
      AGENT_NAME,
    );

  return runObserverLogged(
    config,
    runLog,
  );
};

/**
 * The Observer run itself.
 *
 * Split out of {@link runObserver} so the run-log handle stays an explicit
 * dependency rather than something reached for from module scope.
 */
const runObserverLogged = async (
  config: ObserverConfig,
  runLog: AgentRunLog,
) => {
  const observerContext =
    await getAgenticContext(config);

  const initialContextTokens =
    estimateTokens(
      observerContext,
    );

  logAgentStart(
    AGENT_NAME,
    initialContextTokens,
  );

  const observerPrompt = `
You are the Observer agent for a market intelligence platform.

Your role is breadth.

The intelligence pipeline is:

Observer = breadth
Triage = prioritization
Researcher = depth
Brief Analyst = compression and synthesis
Lead = daily intelligence narrative

You are the Observer.

Your job is to monitor the configured market domain and identify meaningful developments occurring today.

You are an event and market observer, not a researcher.

Start with the deterministic market context available through your tools. Use it to identify meaningful changes, relationships, anomalies, or unusual market activity.

Then identify relevant developments, events, announcements, regulatory actions, security incidents, market narratives, sentiment shifts, geopolitical developments, and other events that may materially affect the configured domain.

The configured domain is your primary subject, but markets do not operate in isolation.

Monitor relevant external markets and events when they may materially affect, explain, or provide important context for the configured domain.

For example, when observing crypto, relevant external context may include equities, interest rates, the US dollar, commodities, macroeconomic developments, global risk sentiment, regulation, and geopolitics.

Do not assume causation.

If crypto declines alongside equities, report the relationship when supported by the available evidence.

Do not claim that equities caused the crypto move unless there is evidence supporting that conclusion.

Your output should contain concise observations about meaningful developments.

Each observation should represent something worth passing to the Triage agent.

Examples:

Change
Bitcoin ETF inflows increased significantly.

Change
Crypto trading volume increased sharply while aggregate market capitalization declined.

Relationship
Crypto markets declined alongside weakness in major equity indexes.

Anomaly
A major divergence appeared between crypto market capitalization and trading activity.

Event
A major cryptocurrency exchange experienced a security incident.

Regulation
A government introduced new legislation affecting digital assets.

Speculation
A major token moved sharply following market discussion of a potential protocol change.

Only report meaningful developments.

Do not report ordinary or unchanged market conditions merely because the data is available.

Do not create observations simply to increase the number of observations.

Search broadly enough to identify meaningful developments, but stop when additional searching is unlikely to produce materially different observations.

When a tool returns useful evidence, treat the tool result itself as evidence even if the result is not repeated in your own response text.

If a search returns zero results, weak results, or results that appear unrelated to the observation objective, do not immediately conclude that nothing happened. Change the search query, broaden or adjust the relevant filters, or inspect another available source before concluding that no meaningful development was found.

You should:

- inspect the available deterministic data
- identify meaningful changes
- identify relationships between markets when supported by evidence
- identify anomalies or unusual activity
- identify relevant external developments
- monitor relevant external markets
- distinguish confirmed events from speculation
- preserve uncertainty when evidence is incomplete
- remain within the configured observation scope
- prioritize breadth over depth
- use actual tool results as evidence for later synthesis

You should NOT:

- perform deep research
- investigate a story exhaustively
- determine final importance
- write the daily intelligence narrative
- invent causes
- invent facts
- speculate beyond available evidence
- turn ordinary market conditions into observations
- create observations merely to increase output count
- include URLs or citations in the observation text
- include source names or references in the observation text
- use Markdown formatting such as bold text, headings, or numbered lists

Sources and supporting evidence are handled separately by the system.

Return concise observations when you have enough information.

The goal is not to produce a fixed number of observations.

The goal is to discover the meaningful things that happened.

OBSERVER Foundational Context:

${observerContext}
`;

  const finalObserverPrompt = `
You are producing the final output for the Observer.

The research phase is complete.

You have no tools available during this step.

You have been given:

1. Deterministic foundational market context.
2. The research model's notes.
3. The raw tool evidence collected during the research phase.

Use all three together.

The deterministic foundational context provides the current market state and context.

The research notes summarize what the research phase discovered.

The raw tool evidence is the primary factual evidence for the final observations.

Using the supplied foundational context, research notes, and raw evidence:

- produce concise observations about meaningful developments
- use the foundational context to understand current market conditions and relationships
- do not treat foundational context alone as proof of a news event
- preserve uncertainty when evidence is incomplete
- do not invent facts
- do not invent causes
- do not perform additional research
- do not explain your reasoning
- do not use Markdown formatting
- return only observations worth passing to Triage

A meaningful observation may be based directly on a single strong event or may connect multiple pieces of evidence when the relationship is supported.

Do not require the research model to have explicitly repeated a tool result in its notes.

The raw tool evidence is available separately and should be used directly.

If the collected evidence contains meaningful developments, report them.

After the observations, include:

Research Notes:

Under that heading, reproduce the supplied research notes.

Do not add new facts to the Research Notes section.

If the collected evidence does not support a meaningful observation, return:

No meaningful developments identified.

Research Notes:

Then provide the supplied research notes.
`;

  const prompt = `
Observe the ${config.domain} domain for today.

Objective:
${config.objective}

Areas of observation:
${config.categories
    .map(
      (category) =>
        `- ${category}`,
    )
    .join("\n")}

Identify meaningful developments and produce observations.
`;

  // --------------------------------------------------
  // Prompt diagnostics
  // --------------------------------------------------

  await runLog.record(
    "initializer",
    {
      domain:
        config.domain,

      objective:
        config.objective,

      categories:
        config.categories,

      configuredTools:
        config.tools,

      maxSteps:
        MAX_AGENT_STEPS,

      initialContextTokens,

      initialContextTokenization:
        "Estimated with the local gpt-4o tokenizer; foundational context only.",

      instructionsCharacters:
        observerPrompt.length,

      finalInstructionsCharacters:
        finalObserverPrompt.length,

      contextCharacters:
        observerContext.length,

      context:
        JSON.parse(
          observerContext,
        ),
    },
  );

  logAgentPrompt(
    AGENT_NAME,
    prompt,
  );

  await runLog.record(
    "prompt",
    {
      prompt,
    },
  );

  // --------------------------------------------------
  // Research
  // --------------------------------------------------

  const stepEntrySequences: number[] =
    [];

  const {
    researchSteps,
    researchUsage,
    researchEvidence,
    lastReasoningText,
  } =
    await runAgentResearch({
      model:
        models.openrouter,

      instructions:
        observerPrompt,

      prompt,

      tools:
        getAgenticTooling(config),

      maxSteps:
        MAX_AGENT_STEPS,

      onStepEnd: async (
        step,
      ) => {
        logAgentStep(
          AGENT_NAME,
          step,
        );

        stepEntrySequences.push(
          await runLog.record(
            "step",
            normalizeStep(step),
          ),
        );
      },
    });

  // --------------------------------------------------
  // Final observable reasoning
  // --------------------------------------------------

  logAgentReasoning(
    AGENT_NAME,
    lastReasoningText,
  );

  await runLog.record(
    "reasoning",
    lastReasoningText,
  );

  // --------------------------------------------------
  // Research evidence diagnostics
  // --------------------------------------------------

  logAgentResearchEvidence(
    AGENT_NAME,
    researchEvidence,
  );

  // No `evidence` entry: every value it holds is already recorded once in the
  // `step` entries above. Storing it again doubled the step payloads for
  // nothing.

  // --------------------------------------------------
  // Research Notes
  // --------------------------------------------------

  const embeddedEvidence =
    JSON.stringify(
      researchEvidence,
      null,
      2,
    );

  const researchNotesPrompt = `
Create concise research notes from the completed Observer research.

The research phase is complete and you have no tools available.

Use the raw tool evidence below as the factual basis.

Your notes should:

- summarize the meaningful developments discovered
- connect related evidence when supported
- distinguish confirmed events from speculation
- preserve important uncertainty
- mention important market context from the evidence
- avoid inventing facts or causes
- avoid deep research
- do not write the final daily intelligence narrative

Return concise plain-text research notes for the final Observer synthesis.

<research_evidence>
${embeddedEvidence}
</research_evidence>
`;

  const researchNotesResult =
    streamText({
      model:
        models.openrouter,

      instructions:
        "You are the Observer research-notes writer. Summarize the collected evidence for a final synthesis model. Do not perform additional research.",

      prompt:
        researchNotesPrompt,
    });

  const researchNotes =
    await researchNotesResult.text;

  const researchNotesUsage =
    await researchNotesResult.usage;

  const normalizedResearchNotes =
    researchNotes.trim() ||
    "No research notes were produced.";

  logAgentResearchNotes(
    AGENT_NAME,
    normalizedResearchNotes,
  );

  const researchNotesEntrySequence =
    await runLog.record(
      "research_notes",
      {
        notes:
          normalizedResearchNotes,
      },
    );

  // --------------------------------------------------
  // Synthesis prompt
  // --------------------------------------------------

  const synthesisPrompt = `
Produce the final Observer observations.

The configured domain is:

${config.domain}

The Observer objective is:

${config.objective}

The areas being observed are:

${config.categories.join(", ")}

The deterministic foundational market context is:

<foundational_context>
${observerContext}
</foundational_context>

The research model's notes are:

<research_notes>
${normalizedResearchNotes}
</research_notes>

The following is the raw evidence returned by the tools during the research phase.

<research_evidence>
${embeddedEvidence}
</research_evidence>

Use the foundational market context, research notes, and raw tool evidence together.

The foundational context provides the deterministic current market state.

Use it to understand the current market environment, relationships, changes, and context.

Do not treat foundational context alone as proof that an external event occurred.

The research notes summarize what the research phase discovered.

The raw tool evidence is the primary factual evidence for the final observations.

Important:

- A tool result is evidence even if the research model did not repeat it in its notes.
- Do not ignore tool results simply because the research notes are short or empty.
- Use the foundational context to understand the current market state.
- Do not invent facts that are not present in the foundational context or research evidence.
- Do not invent causal relationships.
- Do not perform additional research.
- Report meaningful developments supported by the evidence.
- Preserve uncertainty where appropriate.
- Return concise observations first.
- After the observations, include "Research Notes:".
- Under "Research Notes:", reproduce the supplied research notes.
- Do not add new facts to the Research Notes section.
`;

  // --------------------------------------------------
  // Synthesis diagnostics
  // --------------------------------------------------

  logAgentSynthesisStart(
    AGENT_NAME,
    synthesisPrompt,
  );

  await runLog.record(
    "synthesis",
    {
      prompt:
        synthesisPrompt
          .replace(
            observerContext,
            "{{foundationalContext}}",
          )
          .replace(
            embeddedEvidence,
            RESEARCH_EVIDENCE_MARKER,
          )
          .replace(
            normalizedResearchNotes,
            RESEARCH_NOTES_MARKER,
          ),

      researchNotes:
        normalizedResearchNotes,

      researchEvidenceEntries:
        stepEntrySequences,

      embeddedValues: {
        ["{{foundationalContext}}"]:
          "observerContext, verbatim",

        [RESEARCH_NOTES_MARKER]:
          "researchNotes, verbatim",

        [RESEARCH_EVIDENCE_MARKER]:
          `${RESEARCH_EVIDENCE_FORMAT} over the entries named by researchEvidenceEntries, in order`,
      },
    },
  );

  // --------------------------------------------------
  // Final synthesis
  // --------------------------------------------------

  const synthesisResult =
    streamText({
      model:
        models.openrouter,

      instructions:
        finalObserverPrompt,

      prompt:
        synthesisPrompt,
    });

  let finalText = "";

  for await (
    const textDelta of
      synthesisResult.textStream
  ) {
    finalText += textDelta;

    process.stdout.write(
      textDelta,
    );
  }

  const synthesisUsage =
    await synthesisResult.usage;

  // --------------------------------------------------
  // Final diagnostics
  // --------------------------------------------------

  logAgentUsage({
    agentName:
      AGENT_NAME,

    initialContextTokens,

    researchUsage,

    researchNotesUsage,

    synthesisUsage,

    researchSteps:
      researchSteps.length,
  });

  await runLog.record(
    "usage",
    {
      initialContextTokens,

      researchUsage,

      researchNotesUsage,

      synthesisUsage,

      researchSteps:
        researchSteps.length,

      totalRunTokens:
        (researchUsage.totalTokens ?? 0) +
        (researchNotesUsage.totalTokens ?? 0) +
        (synthesisUsage.totalTokens ?? 0),
    },
  );

  logAgentToolUsage(
    AGENT_NAME,
    researchSteps,
  );

  logAgentOutput(
    AGENT_NAME,
    finalText,
  );

  const runLogPath =
    await runLog.finish(
      finalText,
    );

  runLog.note(
    `Run log written to ${runLogPath}`,
  );

  return finalText;
};