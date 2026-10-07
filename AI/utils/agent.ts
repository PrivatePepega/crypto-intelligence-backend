import { isStepCount, streamText } from "ai";

import type { RecordedStep, RecordedToolCall, SdkStep } from "../../types/AI/observer.js";

// --------------------------------------------------
// Reasoning
// --------------------------------------------------

/**
 * Flattens one `reasoning_details` entry to text.
 *
 * Providers deliver reasoning two ways: as a single string, or as an array of
 * streamed chunks separated by empty strings. Reading only the string form
 * silently discarded the reasoning for every chunked response.
 *
 * Chunks are joined with a newline because the empty strings between them are
 * the paragraph separators: joining with `""` would weld the paragraphs
 * together.
 *
 * `any` is deliberate here. The shape is provider-defined and varies between
 * providers and SDK versions, so the fields are read defensively rather than
 * against a type that would be a guess.
 */
const getReasoningDetailText = (item: any): string => {
  if (typeof item?.text === "string") return item.text;

  if (Array.isArray(item?.text)) {
    return item.text.filter((chunk: unknown) => typeof chunk === "string").join("\n");
  }

  return "";
};

/**
 * Pulls the provider's reasoning text off a step.
 *
 * Exported because a step's reasoning is needed per step when recording a run,
 * not only for the final one, and re-deriving it would risk the two disagreeing
 * about where providers hide it.
 *
 * `any` for the same reason as {@link getReasoningDetailText}.
 */
export const getReasoningText = (step: any): string | null => {
  if (typeof step.reasoning === "string" && step.reasoning.trim()) {
    return step.reasoning.trim();
  }

  if (Array.isArray(step.reasoning)) {
    const reasoningText = step.reasoning
      .filter((item: any) => typeof item?.text === "string")
      .map((item: any) => item.text)
      .join("\n")
      .trim();

    if (reasoningText) return reasoningText;
  }

  const reasoningDetails = step.providerMetadata?.openrouter?.reasoning_details;

  if (Array.isArray(reasoningDetails)) {
    const reasoningText = reasoningDetails
      .filter((item: any) => item?.type === "reasoning.text")
      .map(getReasoningDetailText)
      .filter(Boolean)
      .join("\n")
      .trim();

    if (reasoningText) return reasoningText;
  }

  return null;
};

/**
 * Reads a step's reasoning, wherever the provider put it.
 *
 * Providers differ: some expose reasoning on the step, others only on the tool
 * call or tool result. Checking the step alone would record `null` and lose the
 * reasoning, so each carrier is tried in turn and the first hit wins - still one
 * copy per step.
 */
const stepReasoning = (step: SdkStep): string | null => {
  const carriers: unknown[] = [step, ...(step.toolCalls ?? []), ...(step.toolResults ?? [])];

  for (const carrier of carriers) {
    const found = getReasoningText(carrier as SdkStep);

    if (found) return found;
  }

  return null;
};

// --------------------------------------------------
// Step normalization
// --------------------------------------------------

/**
 * Collapses a research step to reasoning, query input and tool response.
 *
 * The SDK reports a call and its result as two objects that each repeat the tool
 * name, the input and the provider metadata, so recording them verbatim stores
 * the same payload four times over. Pairing them by `toolCallId` keeps each
 * value once and drops the duplicated metadata.
 *
 * A result whose call was not reported is kept rather than dropped, so no tool
 * response is ever lost.
 */
export const normalizeStep = (step: SdkStep): RecordedStep => {
  const toolCalls = step.toolCalls ?? [];
  const toolResults = step.toolResults ?? [];

  const outputByCallId = new Map<string, unknown>();

  for (const toolResult of toolResults) {
    outputByCallId.set(toolResult.toolCallId, toolResult.output);
  }

  const paired: RecordedToolCall[] = toolCalls.map((toolCall) => ({
    toolCallId: toolCall.toolCallId,
    tool: toolCall.toolName,
    input: toolCall.input,
    output: outputByCallId.get(toolCall.toolCallId) ?? null,
  }));

  const pairedIds = new Set(paired.map((call) => call.toolCallId));

  for (const toolResult of toolResults) {
    if (pairedIds.has(toolResult.toolCallId)) continue;

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
