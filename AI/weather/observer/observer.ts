import {
  streamText,
} from "ai";

import { models } from "../../../AI/providers/model.js";

import {
  type ObserverConfig,
} from "./observer.config.js";

import {
  getAgenticContext,
  getAgenticTooling,
  estimateTokens,
} from "../../utils/general.tools.js";

import {
  logAgentStart,
  logAgentPrompt,
  logAgentResearchEvidence,
  logAgentResearchNotes,
  logAgentSynthesisStart,
  logAgentUsage,
  logAgentToolUsage,
  logAgentOutput,
  logAgentReasoning,
  logAgentStep,
} from "../../utils/logger.js";

import {
  getReasoningText,
  runAgentResearch,
} from "../../utils/agentResearch.js";

import {
  createAgentRunLog,
  type AgentRunLog,
} from "../../utils/agentRunLog.js";

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

/** Structural view of the SDK shapes this module reads. */
type SdkToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;

  /** Reasoning is frequently attached here rather than on the step. */
  providerMetadata?: unknown;
};

type SdkToolResult = {
  toolCallId: string;
  toolName: string;
  output: unknown;

  /** Reasoning is frequently attached here rather than on the step. */
  providerMetadata?: unknown;
};

type SdkStep = {
  stepNumber: number;
  text?: string;
  toolCalls?: SdkToolCall[];
  toolResults?: SdkToolResult[];

  // Reasoning fields are read dynamically by getReasoningText.
  [key: string]: unknown;
};

/** One tool call paired with its response. */
type RecordedToolCall = {
  toolCallId: string;
  tool: string;
  input: unknown;
  output: unknown;
};

/** One research step, holding each value exactly once. */
type RecordedStep = {
  stepNumber: number;
  text: string;
  reasoning: string | null;
  toolCalls: RecordedToolCall[];
};

/**
 * Reads a step's reasoning, wherever the provider put it.
 *
 * Providers differ: some expose reasoning on the step, others only on the tool
 * call or tool result. Checking the step alone would record `null` and lose the
 * reasoning, so each carrier is tried in turn and the first hit wins - still one
 * copy per step.
 */
const stepReasoning = (
  step: SdkStep,
): string | null => {
  const carriers: unknown[] = [
    step,
    ...(step.toolCalls ?? []),
    ...(step.toolResults ?? []),
  ];

  for (const carrier of carriers) {
    const found = getReasoningText(
      carrier as SdkStep,
    );

    if (found) {
      return found;
    }
  }

  return null;
};

/**
 * Collapses a research step to reasoning, query input and tool response.
 *
 * The SDK reports a call and its result as two objects that each repeat the
 * tool name, the input and the provider metadata, so recording them verbatim
 * stores the same payload four times over. Pairing them by `toolCallId` keeps
 * each value once and drops the duplicated metadata.
 *
 * A result whose call was not reported is kept rather than dropped, so no tool
 * response is ever lost.
 */
export const normalizeStep = (
  step: SdkStep,
): RecordedStep => {
  const toolCalls = step.toolCalls ?? [];
  const toolResults = step.toolResults ?? [];

  const outputByCallId = new Map<string, unknown>();

  for (const toolResult of toolResults) {
    outputByCallId.set(
      toolResult.toolCallId,
      toolResult.output,
    );
  }

  const paired: RecordedToolCall[] =
    toolCalls.map((toolCall) => ({
      toolCallId: toolCall.toolCallId,
      tool: toolCall.toolName,
      input: toolCall.input,
      output:
        outputByCallId.get(toolCall.toolCallId) ??
        null,
    }));

  const pairedIds = new Set(
    paired.map((call) => call.toolCallId),
  );

  for (const toolResult of toolResults) {
    if (pairedIds.has(toolResult.toolCallId)) {
      continue;
    }

    paired.push({
      toolCallId: toolResult.toolCallId,
      tool: toolResult.toolName,
      input: null,
      output: toolResult.output,
    });
  }

  return {
    stepNumber: step.stepNumber,
    text: step.text ?? "",
    reasoning: stepReasoning(step),
    toolCalls: paired,
  };
};

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
  const runLog = await createAgentRunLog(AGENT_NAME);

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
    estimateTokens(observerContext);

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

You have been given both:

1. The research model's notes.
2. The raw tool evidence collected during the research phase.

The raw tool evidence is the primary factual evidence for this synthesis.

Using ONLY the collected evidence:

- produce concise observations about meaningful developments
- preserve uncertainty when evidence is incomplete
- do not invent facts
- do not invent causes
- do not perform additional research
- do not explain your reasoning
- do not use Markdown formatting
- return only observations worth passing to Triage

A meaningful observation may be based directly on a single strong event or may connect multiple pieces of evidence when the relationship is supported.

Do not require the research model to have explicitly repeated a tool result in its notes. The raw tool evidence is available separately and should be used directly.

If the collected evidence contains meaningful developments, report them.

If the collected evidence does not support a meaningful observation, return:

No meaningful developments identified.
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
      domain: config.domain,
      objective: config.objective,
      categories: config.categories,
      configuredTools: config.tools,
      maxSteps: MAX_AGENT_STEPS,
      instructionsCharacters:
        observerPrompt.length,
      finalInstructionsCharacters:
        finalObserverPrompt.length,
      initialContextTokens,
      initialContextTokenization:
        "Estimated with the local gpt-4o tokenizer; foundational context only.",
      context:
        JSON.parse(observerContext),
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

  const stepEntrySequences: number[] = [];

  const {
    researchText,
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
    researchNotes ||
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

The foundational context provides the deterministic market state.

The research notes summarize what the research phase discovered.

The raw tool evidence is the primary factual evidence for the final observations.

Important:

- A tool result is evidence even if the research notes do not mention it.
- Use the foundational context to understand current market conditions and relationships.
- Do not treat foundational context as proof of an event unless the data supports that conclusion.
- Do not invent facts that are not present in the foundational context or research evidence.
- Do not invent causal relationships.
- Do not perform additional research.
- Report meaningful developments supported by the available evidence.
- Preserve uncertainty where appropriate.
- Return concise observations first.
- After the observations, include a section titled "Research Notes:".
- Under "Research Notes:", reproduce the research notes provided above.
- Do not add new facts to the research notes.
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
            normalizedResearchNotes,
            RESEARCH_NOTES_MARKER,
          )
          .replace(
            embeddedEvidence,
            RESEARCH_EVIDENCE_MARKER,
          ),

      researchNotes:
        normalizedResearchNotes,

      researchNotesEntry:
        researchNotesEntrySequence,

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

    researchUsage,

    researchNotesUsage,

    synthesisUsage,

    researchSteps:
      researchSteps.length,

    initialContextTokens,
  });

  await runLog.record(
    "usage",
    {
      researchUsage,
      researchNotesUsage,
      synthesisUsage,
      researchSteps:
        researchSteps.length,
      initialContextTokens,
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
    await runLog.finish(finalText);

  runLog.note(
    `Run log written to ${runLogPath}`,
  );

  return finalText;
};