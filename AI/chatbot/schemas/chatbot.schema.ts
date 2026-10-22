import { Annotation } from "@langchain/langgraph";

/**
 * Where the chatbot's climate context came from.
 *
 * `provided` means the caller supplied `climateBrief` directly instead of the
 * analyzer loading it from PostgreSQL.
 */
export type ChatbotClimateBriefSource =
  "requested_date" | "current_date" | "latest_available" | "provided" | "none" | "error";

/** The analyzer's exact out-of-scope response, used for conditional routing. */
export const OUT_OF_SCOPE_RESPONSE = "we only focus on financial markets here buddy";

/** The answer checker's exact fallback when an answer cannot be made usable. */
export const FALLBACK_ANSWER =
  "Sorry, I couldn't generate a usable answer to your question. Please try rephrasing your query.";

/** Maximum graph-level answer attempts after checker rejections. */
export const DEFAULT_MAX_ANSWER_ATTEMPTS = 3;

/**
 * Shared chatbot graph state.
 *
 * A normal invocation starts with `{ userQuery }`. The analyzer fills in the
 * interpreted query, climate context, and reset fields; each downstream node
 * replaces only the fields it owns.
 */
export const ChatbotState = Annotation.Root({
  // Original request and the analyzer's interpretation.
  userQuery: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  analyzerQuery: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  answerExample: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  // Climate context loaded once by the analyzer and reused by the researcher
  // and answer generator.
  climateBrief: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  climateBriefDate: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  climateBriefSource: Annotation<ChatbotClimateBriefSource>({
    value: (_, update) => update,
    default: () => "none",
  }),

  outOfScope: Annotation<boolean>({
    value: (_, update) => update,
    default: () => false,
  }),

  // Research evidence as a plain-text package.
  researcherOutput: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  researchError: Annotation<string | null>({
    value: (_, update) => update,
    default: () => null,
  }),

  // Answer generation and checker lifecycle.
  answer: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  checkedAnswer: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  finalAnswer: Annotation<string>({
    value: (_, update) => update,
    default: () => "",
  }),

  checkerPassed: Annotation<boolean>({
    value: (_, update) => update,
    default: () => false,
  }),

  checkerError: Annotation<string | null>({
    value: (_, update) => update,
    default: () => null,
  }),

  answerAttempts: Annotation<number>({
    value: (_, update) => update,
    default: () => 0,
  }),

  maxAnswerAttempts: Annotation<number>({
    value: (_, update) => update,
    default: () => DEFAULT_MAX_ANSWER_ATTEMPTS,
  }),

  previousAnswer: Annotation<string | null>({
    value: (_, update) => update,
    default: () => null,
  }),

  retryFeedback: Annotation<string | null>({
    value: (_, update) => update,
    default: () => null,
  }),
});

export type ChatbotStateType = typeof ChatbotState.State;
