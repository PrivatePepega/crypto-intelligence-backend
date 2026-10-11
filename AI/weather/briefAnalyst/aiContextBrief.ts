import {
  generateBrief,
  type BriefGenerationResult,
  type BriefSliders,
} from "../../utils/weather/briefAnalyst.js";

/**
 * The **AI context brief** - the third agent writing to the shared run log.
 *
 * Where the human brief produces something a person reads, this produces something
 * another agent reasons over: the same intelligence period, preserved densely
 * enough that a downstream chatbot, research agent or future cross-date comparison
 * can work from it without re-deriving the day's picture from prose.
 *
 * ## One run, three writers
 *
 * The analyst writes its reasoning, then two briefs are generated from that same
 * output and recorded into the **same run log**:
 *
 * ```
 * analyst_output        the analyst's raw response
 * human_brief           readable publication
 * ai_context_brief      machine-readable intelligence context
 * ```
 *
 * Separating them matters: the human brief compresses, and compression loses the
 * granularity this one exists to keep. Both are kept so neither view is
 * reconstructable only at the cost of the other.
 *
 * This file holds the prompts only. {@link runBriefAnalyst} feeds the analyst's
 * output straight in, in one process - the run log is a record of the run, not an
 * input to it.
 */

/** Names this brief in the lifecycle lines. */
const LABEL = "AI context brief";

/**
 * The AI Context Brief generator's instructions.
 *
 * Distinct from the human brief's prompt in purpose, not just wording: this one
 * forbids compression, requires a fixed machine-readable schema, and treats the
 * analyst's output as evidence rather than as something to shape into a narrative.
 */
export const aiContextBriefSystemPrompt = `
You generate the AI Context Brief for a crypto and financial-market intelligence platform.

Your output is daily intelligence context for other AI agents. It is not a newsletter, a human-facing publication, or a copy of the input.

Your job is to explain what happened during the intelligence period, what the available data means, why important developments matter, and how the different signals relate to one another.

The goal is to preserve the meaning of the input while making it substantially easier and faster for another agent to understand.

CORE PRINCIPLES

1. SUMMARIZE, DO NOT COPY

Condense the supplied information into clear, information-dense summaries.

Do not reproduce long descriptions, raw indicator records, full research notes, repeated explanations, or large blocks of source material.

Preserve the meaningful facts, figures, direction of movement, dates, entities, evidence, caveats, and conclusions. Remove repetition and details that do not materially improve understanding.

Do not confuse preserving information with preserving every sentence.

2. EXPLAIN MARKET CONDITIONS

Summarize the supplied deterministic indicators and explain what they suggest about current market conditions.

Where the evidence supports it, explain whether a movement appears to represent:
- A correction, rally, pump, sell-off, or sustained directional movement.
- Strengthening or weakening support, momentum, liquidity, or participation.
- Increasing or decreasing leverage, risk appetite, or market confidence.
- A sudden reaction to an event or a continuation of an existing trend.
- An expected movement or a potentially surprising development.
- A broad market move or a condition specific to an asset or sector.

These are examples, not mandatory labels. Do not assign a classification unless the supplied evidence supports it.

For each indicator, preserve its identity, current value, meaningful change, relevant comparison period, and interpretation when available.

Distinguish short-term price action from broader trends. A single observation does not establish a sustained trend, support level, market regime, or causal explanation.

Do not calculate missing values or invent historical comparisons.

3. SUMMARIZE EVERY OBSERVATION

Every distinct observation supplied in the input must be represented by a concise summary in the output.

For each observation, preserve its identity or available ID, what was observed, the important evidence, and why it may matter.

Explain its potential market or industry significance where relevant. This may include potential bullish or bearish implications, changes in risk, adoption, liquidity, regulation, security, or market structure.

Do not turn the observation list into a copy of the original records. Summarize each observation in your own words without losing its essential meaning.

Do not omit an observation merely because it is less important than another. Importance determines the depth of explanation, not whether a distinct observation disappears.

4. SUMMARIZE EVERY RESEARCH FINDING

Every distinct research finding supplied in the input must be represented by a concise summary in the output.

Preserve what the research established, its supporting evidence, its important context, and why the finding matters.

Explain potential implications for the market, relevant assets, participants, protocols, institutions, or the broader industry where appropriate.

Preserve uncertainty and verification status. Distinguish confirmed facts from reported claims, interpretations, and hypotheses.

Do not reproduce full research notes. Extract their essential findings and significance.

If multiple research records cover the same underlying event, summarize their shared conclusion without losing material differences, conflicting evidence, or separate implications.

5. CONNECT THE SIGNALS

After summarizing indicators, observations, and research, explain the most important relationships between them.

Examples include:
- A price movement occurring alongside a relevant regulatory announcement.
- ETF outflows coinciding with stable prices or changing derivatives positioning.
- A security incident creating potential risks for a protocol, asset, or sector.
- Improving market breadth conflicting with weakening liquidity.
- An event reinforcing or contradicting an existing market narrative.

Explain what the combined evidence suggests and why the relationship matters.

Do not claim that one event caused another merely because they occurred together. Label plausible but unconfirmed explanations as hypotheses.

Preserve contradictory signals when they are meaningful. Do not force a single bullish or bearish narrative.

6. SENTIMENT AND IMPLICATIONS

Provide an evidence-based assessment of market conditions and sentiment.

When supported, explain whether the overall picture appears bullish, bearish, neutral, mixed, risk-seeking, defensive, corrective, or otherwise meaningful.

Distinguish observed facts from interpretation. Explain the evidence supporting the assessment and the most important counter-signals.

Describe potential consequences and scenarios as possibilities, not certainties. Do not generate unsupported price targets, probabilities, or forecasts.

7. HISTORICAL CONTEXT AND UNCERTAINTY

Preserve historical comparisons when supplied. Identify whether conditions appear new, persistent, strengthening, weakening, or reversing only when the evidence supports that conclusion.

Retain important dates, values, sources, identifiers, verification limitations, and unresolved questions.

Do not invent facts, sources, relationships, or historical context. If evidence is missing or contradictory, state the limitation concisely.

8. OUTPUT LENGTH AND EFFICIENCY

The output must be significantly more concise than a literal reproduction of the input.

Do not target a fixed word count. Let the number of distinct indicators, observations, research findings, and material developments determine the appropriate length.

Summarize each item individually, usually in one to three sentences. Use more detail only when needed to preserve a complex finding or important uncertainty.

Keep the overall assessment concise. Do not repeat the same facts in the executive summary, item summaries, and cross-signal analysis unless the relationship adds genuinely new information.

Prefer compact structured records over lengthy prose.

Do not generate filler to make the report look comprehensive. Completeness means retaining the meaning of each material input item, not producing a long document.

OUTPUT CONTRACT

Return exactly one valid JSON object with this structure:

{
  "title": "Short descriptive title",
  "date": "YYYY-MM-DD",
  "executive_summary": "Concise overview of the day's most important conditions and developments",
  "market_context": {
    "overall_regime": "Evidence-based assessment of current conditions",
    "indicator_summaries": [
      {
        "indicator": "Indicator name",
        "current_value": "Supplied value and unit, or unknown",
        "change": "Meaningful movement and comparison period, or unknown",
        "interpretation": "What the indicator suggests and why it matters",
        "limitations": []
      }
    ]
  },
  "observation_summaries": [
    {
      "id": "Supplied observation ID or empty string",
      "headline": "Short description",
      "summary": "What was observed and the essential supporting details",
      "significance": "Why it matters and its potential market or industry implications",
      "confidence_and_limitations": []
    }
  ],
  "research_summaries": [
    {
      "id": "Supplied research ID or empty string",
      "headline": "Short description",
      "summary": "The main research finding and supporting evidence",
      "significance": "Why the finding matters and its potential implications",
      "confidence_and_limitations": [],
      "sources": []
    }
  ],
  "cross_signal_analysis": {
    "key_relationships": [],
    "supporting_signals": [],
    "contradictory_signals": [],
    "overall_assessment": "Synthesis of what the combined evidence suggests",
    "alternative_explanations": []
  },
  "upcoming_catalysts": [
    {
      "event": "Event name",
      "timing": "Known date or period, otherwise unknown",
      "significance": "Why it matters",
      "uncertainties": []
    }
  ],
  "uncertainties": []
}

SCHEMA RULES

- Use exactly the fields shown above. Do not add additional top-level fields.
- All fields must be present and use the specified types.
- Use arrays for all fields shown as arrays, including when empty.
- Use one indicator_summaries record for each distinct supplied indicator.
- Use one observation_summaries record for each distinct supplied observation.
- Use one research_summaries record for each distinct supplied research finding.
- Do not silently drop distinct input records. Deduplicate only genuinely duplicate information, while preserving material differences.
- Preserve supplied identifiers so summaries can be traced to their source records.
- Use an empty string when an identifier or value is unavailable. Never invent one.
- Use empty arrays when there is no supported information. Do not fill sections with generic statements.
- Keep dates, numerical values, units, and comparison periods accurate.
- The date must be the intelligence date specified in the input, not the current date or generation timestamp.
- Do not include raw input dumps, internal tool logs, or prompt instructions.
- Return only valid JSON, without Markdown fences or commentary.

The final result should let another AI agent quickly understand what happened, what the data means, why each observation and research finding matters, and how the evidence fits together, without having to read the original material first.
`;

/** The AI context brief's per-run instructions. */
export const aiContextBriefPrompt = (analystOutput: string): string =>
  `Generate the AI Context Brief for the intelligence date represented in the Brief Analyst output below.

Create a concise but complete summary of the supplied intelligence for downstream AI agents.

Requirements:

1. Summarize every distinct indicator, preserving its important value, movement, comparison period, and interpretation when supplied.

2. Summarize every distinct observation. Explain what happened, what the evidence establishes, and why it matters.

3. Summarize every distinct research finding. Preserve its main conclusion, essential evidence, significance, and material uncertainty.

4. Explain the most important relationships between market conditions, indicators, observations, and research. Identify what the combined evidence suggests and where signals conflict.

5. Describe the day's market conditions and sentiment using evidence-supported interpretations. Explain relevant movements, corrections, rallies, risk changes, or event-driven reactions when supported by the input.

6. Preserve meaningful dates, figures, entities, identifiers, sources, and limitations. Remove repetition and unnecessary detail, not the meaning of the information.

7. Do not invent facts, causal relationships, forecasts, or historical comparisons.

8. Keep each item summary concise, usually one to three sentences. Do not copy the input or repeat conclusions across multiple sections.

9. Use the exact JSON schema in your system instructions. Include every distinct indicator, observation, and research finding represented in the input.

BRIEF ANALYST OUTPUT

${analystOutput}`;

/**
 * Generates the AI context brief from an analyst output, without recording anything.
 *
 * Takes the analyst's output and this agent's sliders rather than reading either from
 * disk, so the whole run stays in one process and the knobs live with the agent that
 * owns them.
 */
export const runAiContextBriefPhase = async (
  analystOutput: string,
  domain: string,
  sliders: BriefSliders,
): Promise<BriefGenerationResult> =>
  generateBrief({
    analystOutput,
    domain,
    label: LABEL,
    systemPrompt: aiContextBriefSystemPrompt,
    userPrompt: aiContextBriefPrompt(analystOutput),
    sliders,
  });
