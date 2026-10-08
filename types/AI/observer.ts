/** Structural view of the SDK shapes this module reads. */
export type SdkToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;

  /** Reasoning is frequently attached here rather than on the step. */
  providerMetadata?: unknown;
};

export type SdkToolResult = {
  toolCallId: string;
  toolName: string;
  output: unknown;

  /** Reasoning is frequently attached here rather than on the step. */
  providerMetadata?: unknown;
};

export type SdkStep = {
  stepNumber: number;
  text?: string;
  toolCalls?: SdkToolCall[];
  toolResults?: SdkToolResult[];

  /**
   * Per-step token usage is read through the index signature below rather than a
   * declared field: the SDK's `LanguageModelUsage` has all members required,
   * which a narrower optional shape here would not accept.
   *
   * `usage.inputTokens` is the context this step was sent, which grows across a
   * tool loop as results are appended.
   */
  [key: string]: unknown;
};

/** One tool call paired with its response. */
export type RecordedToolCall = {
  toolCallId: string;
  tool: string;
  input: unknown;
  output: unknown;
};

/**
 * One research step's token usage.
 *
 * `inputTokens` is the size of the context the step was sent, which is what
 * shows how the prompt grows as tool results are fed back in.
 */
export type RecordedStepUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

/** One research step, holding each value exactly once. */
export type RecordedStep = {
  stepNumber: number;
  text: string;
  reasoning: string | null;
  usage: RecordedStepUsage;
  toolCalls: RecordedToolCall[];
};
