import { isStepCount, streamText } from "ai";

import { models } from "../../../AI/providers/model.js";

import { type ObserverConfig } from "./observer.config.js";

import { getAgenticContext, getAgenticTooling, estimateTokens } from "../../utils/general.tools.js";

import {
  logAgentStart,
  logAgentPrompt,
  logAgentResearchEvidence,
  logAgentUsage,
  logAgentToolUsage,
  logAgentOutput,
  logAgentReasoning,
  logAgentStep,
  logAgentSynthesisStart,
  createAgentRunLog,
  type AgentRunLog,
} from "../../utils/logger.js";

import { getReasoningText, normalizeStep } from "../../utils/agent.js";

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
 * Markers left in the stored formatter prompt where a large embedded value was
 * removed.
 */
const OBSERVER_EVIDENCE_MARKER = "{{observerEvidence}}";

/** How the evidence is inlined, so the prompt can be rebuilt exactly. */
const OBSERVER_EVIDENCE_FORMAT = "JSON.stringify(observerEvidence, null, 2)";

/**
 * Runs the Observer, recording the run to a numbered log file.
 *
 * The console transcript is deliberately not captured. Every line the logger
 * prints is already recorded as a structured entry.
 */
export const runObserver = async (config: ObserverConfig) => {
  const runLog = await createAgentRunLog(AGENT_NAME);

  return runObserverLogged(config, runLog);
};

/**
 * The Observer run itself.
 *
 * Split out of {@link runObserver} so the run-log handle stays an explicit
 * dependency rather than something reached for from module scope.
 */
const runObserverLogged = async (config: ObserverConfig, runLog: AgentRunLog) => {
  const observerContext = await getAgenticContext(config);

  const initialContextTokens = estimateTokens(observerContext);

  logAgentStart(AGENT_NAME, initialContextTokens);

  // --------------------------------------------------
  // Observer prompts
  // --------------------------------------------------

  const observerSystemPrompt = `
You are the Observer agent for a market intelligence platform.

Your role is breadth.

The intelligence pipeline is:

Observer = breadth
Triage = prioritization
Brief Analyst = compression and synthesis
Lead = daily intelligence narrative

You are the Observer.

Your job is to monitor the configured market domain and identify meaningful developments occurring today.

You are an event and market observer, not a deep researcher.

Start with the deterministic market context available through your tools. Use it to identify meaningful changes, relationships, anomalies, or unusual market activity.

Then identify relevant developments, events, announcements, regulatory actions, security incidents, market narratives, sentiment shifts, geopolitical developments, and other events that may materially affect the configured domain.

The configured domain is your primary subject, but markets do not operate in isolation.

Monitor relevant external markets and events when they may materially affect, explain, or provide important context for the configured domain.

For example, when observing crypto, relevant external context may include equities, interest rates, the US dollar, commodities, macroeconomic developments, global risk sentiment, regulation, and geopolitics.

Do not assume causation.

If crypto declines alongside equities, report the relationship when supported by the available evidence.

Do not claim that equities caused the crypto move unless there is evidence supporting that conclusion.

Your output should contain concise observations about meaningful developments.

Each observation should represent something worth passing to the next stage.

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
- use actual tool results as evidence for later formatting

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

  const observerDevPrompt = `
Observe the ${config.domain} domain for today.

Objective:
${config.objective}

Areas of observation:
${config.categories.map((category) => `- ${category}`).join("\n")}

Identify meaningful developments and produce observations.
`;

  // --------------------------------------------------
  // Prompt diagnostics
  // --------------------------------------------------

  await runLog.record("initializer", {
    domain: config.domain,

    objective: config.objective,

    categories: config.categories,

    configuredTools: config.tools,

    maxSteps: MAX_AGENT_STEPS,

    initialContextTokens,

    initialContextTokenization:
      "Estimated with the local gpt-4o tokenizer; foundational context only.",

    instructionsCharacters: observerSystemPrompt.length,

    finalInstructionsCharacters: 0,

    contextCharacters: observerContext.length,

    context: JSON.parse(observerContext),
  });

  logAgentPrompt(AGENT_NAME, observerDevPrompt);

  await runLog.record("prompt", {
    prompt: observerDevPrompt,
  });

  // --------------------------------------------------
  // Observer
  // --------------------------------------------------

  const observerResult = streamText({
    model: models.openrouter,

    instructions: observerSystemPrompt,

    prompt: observerDevPrompt,

    tools: getAgenticTooling(config),

    stopWhen: isStepCount(MAX_AGENT_STEPS),

    onStepEnd: async (step) => {
      logAgentStep(AGENT_NAME, step);

      await runLog.record("step", normalizeStep(step));
    },
  });

  const observerText = await observerResult.text;

  const observerSteps = await observerResult.steps;

  const observerUsage = await observerResult.usage;

  // --------------------------------------------------
  // Final observable reasoning
  // --------------------------------------------------

  let lastReasoningText: string | null = null;

  for (const step of observerSteps) {
    const reasoningText = getReasoningText(step);

    if (reasoningText) {
      lastReasoningText = reasoningText;
    }
  }

  logAgentReasoning(AGENT_NAME, lastReasoningText);

  await runLog.record("reasoning", lastReasoningText);

  // --------------------------------------------------
  // Observer evidence
  // --------------------------------------------------

  const observerEvidence = observerSteps
    .filter(
      (step) => step.toolCalls.length > 0 || step.toolResults.length > 0 || Boolean(step.text),
    )
    .map((step) => ({
      step: step.stepNumber + 1,

      text: step.text || null,

      toolCalls: step.toolCalls.map((toolCall) => ({
        tool: toolCall.toolName,
        arguments: toolCall.input,
      })),

      toolResults: step.toolResults.map((toolResult) => ({
        tool: toolResult.toolName,
        result: toolResult.output,
      })),
    }));

  logAgentResearchEvidence(AGENT_NAME, observerEvidence);

  // --------------------------------------------------
  // Formatter prompts
  // --------------------------------------------------

  const formatterSystemPrompt = `
You are the Formatter for the Weather Observer.

The Observer has already completed its observation phase.

You have no tools available.

Your job is to turn the Observer's output and collected evidence into the final Observer output.

The Observer's factual evidence is authoritative for what was actually observed.

Use the supplied deterministic foundational context, Observer output, and raw tool evidence together.

Do not perform additional research.

Do not invent facts.

Do not invent causes.

Do not introduce information that is not supported by the supplied context or evidence.

Preserve uncertainty when evidence is incomplete.

Only retain meaningful developments.

Do not create observations merely to increase the output count.

Do not write the daily intelligence narrative.

Do not perform deep analysis.

Do not explain your reasoning.

Do not use Markdown formatting.

Do not include URLs or citations in the observation text.

Do not include source names or references in the observation text.

Return only concise observations worth passing to Triage.

If the evidence does not support a meaningful development, return:

No meaningful developments identified.
`;

  const formatterDevPrompt = `
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

The Observer's output is:

<observer_output>
${observerText}
</observer_output>

The raw evidence collected by the Observer is:

<observer_evidence>
${JSON.stringify(observerEvidence, null, 2)}
</observer_evidence>

Use all supplied information together.

The foundational context provides deterministic current market state and context.

Use it to understand current market conditions, relationships, changes, and anomalies.

Do not treat foundational context alone as proof that an external event occurred.

The Observer output summarizes what the observation phase identified.

The raw Observer evidence is the primary factual evidence behind those observations.

Important:

- A tool result is evidence even if the Observer did not repeat it in its output.
- Do not ignore tool results simply because the Observer output is short.
- Use the foundational context to understand the current market state.
- Do not invent facts that are not present in the foundational context, Observer output, or Observer evidence.
- Do not invent causal relationships.
- Do not perform additional research.
- Report meaningful developments supported by the evidence.
- Preserve uncertainty where appropriate.
- Return concise observations only.
`;

  // --------------------------------------------------
  // Formatter diagnostics
  // --------------------------------------------------

  logAgentSynthesisStart(AGENT_NAME, formatterDevPrompt);

  await runLog.record("synthesis", {
    prompt: formatterDevPrompt
      .replace(observerContext, "{{foundationalContext}}")
      .replace(JSON.stringify(observerEvidence, null, 2), OBSERVER_EVIDENCE_MARKER),

    embeddedValues: {
      ["{{foundationalContext}}"]: "observerContext, verbatim",

      [OBSERVER_EVIDENCE_MARKER]: `${OBSERVER_EVIDENCE_FORMAT} over the Observer tool evidence`,
    },
  });

  // --------------------------------------------------
  // Formatter
  // --------------------------------------------------

  const formatterResult = streamText({
    model: models.openrouter,

    instructions: formatterSystemPrompt,

    prompt: formatterDevPrompt,
  });

  let finalText = "";

  for await (const textDelta of formatterResult.textStream) {
    finalText += textDelta;

    process.stdout.write(textDelta);
  }

  const formatterUsage = await formatterResult.usage;

  // --------------------------------------------------
  // Final diagnostics
  // --------------------------------------------------

  logAgentUsage({
    agentName: AGENT_NAME,

    initialContextTokens,

    researchUsage: observerUsage,

    synthesisUsage: formatterUsage,

    researchSteps: observerSteps.length,
  });

  await runLog.record("usage",
  {
    initialContextTokens,

    observerUsage,

    formatterUsage,

    observerSteps: observerSteps.length,

    totalRunTokens: (observerUsage.totalTokens ?? 0) + (formatterUsage.totalTokens ?? 0),
  });

  logAgentToolUsage(AGENT_NAME, observerSteps);

  logAgentOutput(AGENT_NAME, finalText);

  const runLogPath = await runLog.finish(finalText);

  runLog.note(`Run log written to ${runLogPath}`);

  return finalText;
};
