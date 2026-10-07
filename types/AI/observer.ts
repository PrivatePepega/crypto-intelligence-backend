



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
  
    // Reasoning fields are read dynamically by getReasoningText.
    [key: string]: unknown;
  };
  
  /** One tool call paired with its response. */
  export type RecordedToolCall = {
    toolCallId: string;
    tool: string;
    input: unknown;
    output: unknown;
  };
  
  /** One research step, holding each value exactly once. */
  export type RecordedStep = {
    stepNumber: number;
    text: string;
    reasoning: string | null;
    toolCalls: RecordedToolCall[];
  };