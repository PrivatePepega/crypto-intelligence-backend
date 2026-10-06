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
} from "../../utils/general.tools.js";

import {
  logAgentStart,
  logAgentPrompt,
  logAgentResearchEvidence,
  logAgentSynthesisStart,
  logAgentUsage,
  logAgentToolUsage,
  logAgentOutput,
  logAgentReasoning,
  logAgentStep,
} from "../../utils/logger.js";

import {
  runAgentResearch,
} from "../../utils/agentResearch.js";

// --------------------------------------------------
// Observer
// --------------------------------------------------

const MAX_AGENT_STEPS = 5;

export const runObserver = async (
  config: ObserverConfig,
) => {
  const observerContext =
    await getAgenticContext(config);

  logAgentStart(
    "Observer",
    observerContext,
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

  logAgentPrompt(
    "Observer",
    prompt,
  );

  // --------------------------------------------------
  // Research
  // --------------------------------------------------

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
          "Observer",
          step,
        );
      },
    });

  // --------------------------------------------------
  // Final observable reasoning
  // --------------------------------------------------

  logAgentReasoning(
    "Observer",
    lastReasoningText,
  );

  // --------------------------------------------------
  // Research evidence diagnostics
  // --------------------------------------------------

  logAgentResearchEvidence(
    "Observer",
    researchEvidence,
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

The research model's notes are:

<research_notes>
${researchText || "No research notes were produced."}
</research_notes>

The following is the raw evidence returned by the tools during the research phase.

<research_evidence>
${JSON.stringify(
    researchEvidence,
    null,
    2,
  )}
</research_evidence>

Use the raw tool evidence as the factual basis for the final observations.

Important:

- A tool result is evidence even if the research model did not repeat it in its notes.
- Do not ignore tool results simply because the research notes are short or empty.
- Do not invent facts that are not present in the evidence.
- Do not invent causal relationships.
- Do not perform additional research.
- Report meaningful developments supported by the evidence.
- Preserve uncertainty where appropriate.
- Return concise observations only.
`;

  // --------------------------------------------------
  // Synthesis diagnostics
  // --------------------------------------------------

  logAgentSynthesisStart(
    "Observer",
    synthesisPrompt,
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
      "Observer",

    researchUsage,

    synthesisUsage,

    researchSteps:
      researchSteps.length,
  });

  logAgentToolUsage(
    "Observer",
    researchSteps,
  );

  logAgentOutput(
    "Observer",
    finalText,
  );

  return finalText;
};