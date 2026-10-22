import pool from "../../../config/database.js";

import { runAnalyzerAgent } from "../agents/analyzer.agent.js";
import { runAnswerCheckerAgent } from "../agents/answerChecker.agent.js";
import { runAnswerGeneratorAgent } from "../agents/answerGenerator.agent.js";
import { runResearcherAgent } from "../agents/researcher.agent.js";

import {
  DEFAULT_MAX_ANSWER_ATTEMPTS,
  FALLBACK_ANSWER,
  OUT_OF_SCOPE_RESPONSE,
  type ChatbotClimateBriefSource,
  type ChatbotStateType,
} from "../schemas/chatbot.schema.js";

// Re-export the state so the graph can import it from either the schema or here.
export { ChatbotState } from "../schemas/chatbot.schema.js";
export type { ChatbotStateType } from "../schemas/chatbot.schema.js";

// --------------------------------------------------
// Climate brief loader (not a graph node)
// --------------------------------------------------
//
// The chatbot uses only the six AI Context Brief columns. They are loaded once
// by the analyzer and then carried in graph state for the researcher and answer
// generator. An explicit date is authoritative and is never replaced by a
// fallback. If no date is supplied, the loader keeps its legacy behavior:
// today's date first, then the most recent populated brief.
// --------------------------------------------------

const AI_CONTEXT_SECTIONS = [
  {
    key: "global_overview",
    title: "Global Overview",
    column: "ai_context_brief_global_overview",
  },
  {
    key: "macro_market_regime",
    title: "Macro & Market Regime",
    column: "ai_context_brief_macro_market_regime",
  },
  {
    key: "sector_conditions",
    title: "Sector Conditions",
    column: "ai_context_brief_sector_conditions",
  },
  {
    key: "important_stories_narratives",
    title: "Important Stories & Narratives",
    column: "ai_context_brief_important_stories_narratives",
  },
  {
    key: "trends_capital_direction",
    title: "Trends & Capital Direction",
    column: "ai_context_brief_trends_capital_direction",
  },
  {
    key: "outlook_risks_uncertainties",
    title: "Outlook, Risks & Uncertainties",
    column: "ai_context_brief_outlook_risks_uncertainties",
  },
] as const;

// Column names come from the trusted constant above, never from user input.
const AI_CONTEXT_COLUMNS = AI_CONTEXT_SECTIONS.map((section) => section.column).join(", ");
const AI_CONTEXT_NULL_CHECKS = AI_CONTEXT_SECTIONS.map(
  (section) => `${section.column} IS NOT NULL`,
).join(" OR ");

type ClimateBriefRow = {
  brief_date: string;
  [column: string]: unknown;
};

export type CurrentClimateBrief = {
  /** YYYY-MM-DD, or an empty string when no brief was found. */
  date: string;
  /** The composed Markdown context passed to the agents. */
  text: string;
  source: ChatbotClimateBriefSource;
  /** Populated sections keyed by their short name. */
  sections: Record<string, string>;
};

/**
 * Normalizes a JSONB AI-context cell into prompt text.
 *
 * Values may be strings (including Markdown or serialized JSON) or parsed JSON
 * objects/arrays. Empty strings, arrays, and objects are treated as absent.
 */
function toBriefText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    }

    return JSON.stringify(value, null, 2)?.trim() ?? "";
  }

  if (typeof value === "object") {
    if (Object.keys(value as Record<string, unknown>).length === 0) {
      return "";
    }

    return JSON.stringify(value, null, 2)?.trim() ?? "";
  }

  return String(value).trim();
}

/** Composes the six AI-context sections into one Markdown string. */
function composeClimateBrief(row: ClimateBriefRow): {
  text: string;
  sections: Record<string, string>;
  populated: string[];
} {
  const sections: Record<string, string> = {};
  const populated: string[] = [];
  const parts: string[] = [];

  for (const section of AI_CONTEXT_SECTIONS) {
    const text = toBriefText(row[section.column]);

    if (text.length === 0) {
      continue;
    }

    sections[section.key] = text;
    populated.push(section.title);
    parts.push(`## ${section.title}\n\n${text}`);
  }

  const text =
    parts.length > 0 ? `# Climate Brief — ${row.brief_date}\n\n${parts.join("\n\n")}` : "";

  return { text, sections, populated };
}

/**
 * Loads the AI Context Brief for a specific date.
 *
 * An explicit `requestedDate` is authoritative: if that date has no populated
 * AI context, the loader returns an empty brief instead of silently using a
 * different date. With no requested date, it keeps the legacy behavior of
 * trying today and then the most recent populated brief.
 *
 * This is deliberately non-fatal: the chatbot agents accept an empty climate
 * brief, so a database problem degrades context rather than blocking the chat.
 */
export async function fetchClimateBriefForDate(
  requestedDate?: string,
): Promise<CurrentClimateBrief> {
  const exactDate = requestedDate?.trim() || "";
  const targetDate = exactDate || new Date().toISOString().slice(0, 10);

  try {
    const currentResult = await pool.query<ClimateBriefRow>(
      `
        SELECT
          TO_CHAR(date, 'YYYY-MM-DD') AS brief_date,
          ${AI_CONTEXT_COLUMNS}
        FROM climate.climate_briefs
        WHERE date = $1::date
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [targetDate],
    );

    const currentRow = currentResult.rows[0];

    if (currentRow) {
      const composed = composeClimateBrief(currentRow);

      if (composed.text.length > 0) {
        console.log(
          `[Chatbot Climate Brief] Loaded ${exactDate ? "requested" : "current"} brief | ` +
            `Date: ${currentRow.brief_date} | Sections: ${composed.populated.join(", ")}`,
        );

        return {
          date: currentRow.brief_date,
          text: composed.text,
          source: exactDate ? "requested_date" : "current_date",
          sections: composed.sections,
        };
      }
    }

    if (exactDate) {
      console.warn(
        `[Chatbot Climate Brief] No populated AI context brief found for requested date ` +
          `${exactDate}; continuing with empty context.`,
      );

      return { date: exactDate, text: "", source: "none", sections: {} };
    }

    const latestResult = await pool.query<ClimateBriefRow>(
      `
        SELECT
          TO_CHAR(date, 'YYYY-MM-DD') AS brief_date,
          ${AI_CONTEXT_COLUMNS}
        FROM climate.climate_briefs
        WHERE (${AI_CONTEXT_NULL_CHECKS})
          AND date < $1::date
        ORDER BY date DESC, created_at DESC
        LIMIT 1
      `,
      [targetDate],
    );

    const latestRow = latestResult.rows[0];

    if (latestRow) {
      const composed = composeClimateBrief(latestRow);

      if (composed.text.length > 0) {
        console.warn(
          `[Chatbot Climate Brief] Current-date brief is missing or has no AI context; ` +
            `using latest available | Date: ${latestRow.brief_date} | ` +
            `Sections: ${composed.populated.join(", ")}`,
        );

        return {
          date: latestRow.brief_date,
          text: composed.text,
          source: "latest_available",
          sections: composed.sections,
        };
      }
    }

    console.warn(
      `[Chatbot Climate Brief] No populated AI context brief found for ${targetDate}; ` +
        "continuing with empty context.",
    );

    return { date: "", text: "", source: "none", sections: {} };
  } catch (error) {
    console.error(`[Chatbot Climate Brief] FAILED | ${errorMessageForLog(error)}`);

    return { date: exactDate, text: "", source: "error", sections: {} };
  }
}

// --------------------------------------------------
// Shared helpers
// --------------------------------------------------

function truncateForLog(value: string, max = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length === 0) {
    return "(empty)";
  }

  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function errorMessageForLog(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Normalizes a status string before comparing it with a fixed agent response.
 * Surrounding quotes, curly apostrophes, and extra whitespace are common model
 * formatting variations and should not defeat the conditional route.
 */
function normalizeStatusText(value: string): string {
  return value
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The analyzer uses this exact sentence when the request is out of scope. */
function isOutOfScopeQuery(value: string): boolean {
  return normalizeStatusText(value).toLowerCase().includes(OUT_OF_SCOPE_RESPONSE);
}

/** The answer checker uses this exact sentence when an answer is unusable. */
function isFallbackAnswer(value: string): boolean {
  return normalizeStatusText(value).toLowerCase().includes(FALLBACK_ANSWER.toLowerCase());
}

// --------------------------------------------------
// Graph nodes
// --------------------------------------------------

/**
 * Interprets the user's message and loads the climate context used by the rest
 * of the graph.
 *
 * The climate brief is fetched once here and carried in state, so the
 * researcher and answer generator do not issue duplicate database queries.
 */
export async function analyzerNode(state: ChatbotStateType) {
  console.log(`[Analyzer] INITIALIZED | Query: ${truncateForLog(state.userQuery)}`);

  try {
    const requestedDate = state.climateBriefDate?.trim() ?? "";
    const providedBrief = state.climateBrief?.trim() ?? "";

    const brief: CurrentClimateBrief =
      providedBrief.length > 0
        ? {
            date: requestedDate,
            text: state.climateBrief,
            source: "provided",
            sections: {},
          }
        : await fetchClimateBriefForDate(requestedDate || undefined);

    const result = await runAnalyzerAgent({
      userQuery: state.userQuery,
      climateBrief: brief.text,
      climateBriefDate: brief.date,
    });

    const analyzerQuery = result.analyzer_query;
    const answerExample = result.answer_example;
    const outOfScope = isOutOfScopeQuery(analyzerQuery) || isOutOfScopeQuery(answerExample);

    const maxAnswerAttempts = Math.max(1, state.maxAnswerAttempts || DEFAULT_MAX_ANSWER_ATTEMPTS);

    console.log(
      `[Analyzer] FINALIZED | Out of scope: ${outOfScope} | ` +
        `Brief: ${brief.date || "none"} (${brief.source})`,
    );

    return {
      userQuery: state.userQuery,
      analyzerQuery,
      answerExample,
      climateBrief: brief.text,
      climateBriefDate: brief.date,
      climateBriefSource: brief.source,
      outOfScope,
      researcherOutput: "",
      researchError: null,
      answer: "",
      checkedAnswer: "",
      finalAnswer: "",
      checkerPassed: false,
      checkerError: null,
      answerAttempts: 0,
      maxAnswerAttempts,
      previousAnswer: null,
      retryFeedback: null,
    };
  } catch (error) {
    console.error(`[Analyzer] FAILED | ${truncateForLog(errorMessageForLog(error), 200)}`);
    throw error;
  }
}

/**
 * Returns the analyzer's fixed out-of-scope response. The checker is
 * intentionally bypassed because this is a final, known response.
 */
export function outOfScopeResponseNode(state: ChatbotStateType) {
  console.log(`[Out Of Scope] INITIALIZED | Query: ${truncateForLog(state.userQuery)}`);
  console.log("[Out Of Scope] FINALIZED | Returning the fixed scope response");

  return {
    outOfScope: true,
    finalAnswer: OUT_OF_SCOPE_RESPONSE,
    answer: OUT_OF_SCOPE_RESPONSE,
    checkedAnswer: OUT_OF_SCOPE_RESPONSE,
    checkerPassed: true,
  };
}

/**
 * Researches the analyzer query using the loaded climate brief.
 *
 * A failed research call is non-fatal: the answer generator receives an empty
 * research string and can still answer with tools or within the available
 * context. The full failure remains in the researcher agent's run log.
 */
export async function researcherNode(state: ChatbotStateType) {
  console.log(`[Researcher] INITIALIZED | Query: ${truncateForLog(state.analyzerQuery)}`);

  try {
    const result = await runResearcherAgent({
      userQuery: state.userQuery,
      analyzerQuery: state.analyzerQuery,
      climateBrief: state.climateBrief,
      climateBriefDate: state.climateBriefDate,
    });

    console.log(`[Researcher] FINALIZED | Output chars: ${result.length}`);

    return { researcherOutput: result, researchError: null };
  } catch (error) {
    const message = errorMessageForLog(error);
    console.error(`[Researcher] FAILED | ${truncateForLog(message, 200)}`);

    return { researcherOutput: "", researchError: message };
  }
}

/**
 * Generates one candidate answer for the current graph-level attempt.
 *
 * The agent's own eight attempts handle malformed generations. This node's
 * attempt count is separate and only advances when the answer checker rejects
 * the candidate.
 */
export async function answerGeneratorNode(state: ChatbotStateType) {
  const attempt = Math.max(1, (state.answerAttempts ?? 0) + 1);
  const maxAttempts = Math.max(1, state.maxAnswerAttempts || DEFAULT_MAX_ANSWER_ATTEMPTS);

  console.log(`[Answer Generator] INITIALIZED | Attempt: ${attempt}/${maxAttempts}`);

  try {
    const answer = await runAnswerGeneratorAgent({
      userQuery: state.userQuery,
      analyzerQuery: state.analyzerQuery,
      researcherOutput: state.researcherOutput,
      climateBrief: state.climateBrief,
      climateBriefDate: state.climateBriefDate,
      answerExample: state.answerExample || undefined,
      retryAttempt: attempt,
      maxAttempts,
      retryFeedback: state.retryFeedback ?? undefined,
      previousAnswer: state.previousAnswer ?? undefined,
    });

    console.log(
      `[Answer Generator] FINALIZED | Attempt: ${attempt}/${maxAttempts} | ` +
        `Answer chars: ${answer.length}`,
    );

    return {
      answer,
      answerAttempts: attempt,
      checkedAnswer: "",
      finalAnswer: "",
      checkerPassed: false,
      checkerError: null,
    };
  } catch (error) {
    const message = errorMessageForLog(error);
    console.error(
      `[Answer Generator] FAILED | Attempt: ${attempt}/${maxAttempts} | ` +
        `${truncateForLog(message, 200)}`,
    );

    return {
      answer: "",
      answerAttempts: attempt,
      checkedAnswer: "",
      finalAnswer: "",
      checkerPassed: false,
      checkerError: message,
    };
  }
}

/**
 * Runs the final quality check and converts the checker's string output into
 * the boolean used by the graph's conditional edge.
 *
 * The checker prompt deliberately returns only a user-facing answer. Its exact
 * fallback sentence is therefore the failure signal; any other non-empty string
 * is considered a pass, including a minimal formatting repair.
 */
export async function answerCheckerNode(state: ChatbotStateType) {
  const attempt = Math.max(1, state.answerAttempts || 1);
  const maxAttempts = Math.max(1, state.maxAnswerAttempts || DEFAULT_MAX_ANSWER_ATTEMPTS);

  console.log(`[Answer Checker] INITIALIZED | Attempt: ${attempt}/${maxAttempts}`);

  if (!state.answer || state.answer.trim().length === 0) {
    const reason = state.checkerError ?? "Answer Generator returned an empty answer.";

    console.warn(`[Answer Checker] FINALIZED | Passed: false | ${truncateForLog(reason, 200)}`);

    return {
      checkedAnswer: "",
      checkerPassed: false,
      finalAnswer: "",
      checkerError: reason,
    };
  }

  try {
    const checked = await runAnswerCheckerAgent({
      userQuery: state.userQuery,
      analyzerQuery: state.analyzerQuery,
      answer: state.answer,
    });

    const passed = checked.trim().length > 0 && !isFallbackAnswer(checked);

    console.log(
      `[Answer Checker] FINALIZED | Attempt: ${attempt}/${maxAttempts} | Passed: ${passed}`,
    );

    return {
      checkedAnswer: checked,
      checkerPassed: passed,
      finalAnswer: passed ? checked : "",
      checkerError: null,
    };
  } catch (error) {
    const message = errorMessageForLog(error);
    console.error(
      `[Answer Checker] FAILED | Attempt: ${attempt}/${maxAttempts} | ` +
        `${truncateForLog(message, 200)}`,
    );

    return {
      checkedAnswer: "",
      checkerPassed: false,
      finalAnswer: "",
      checkerError: message,
    };
  }
}

/**
 * Clears the rejected candidate and gives the answer generator context for the
 * next attempt. The attempt counter is advanced by the generator node.
 */
export function prepareRetryNode(state: ChatbotStateType) {
  const completed = Math.max(0, state.answerAttempts || 0);
  const maxAttempts = Math.max(1, state.maxAnswerAttempts || DEFAULT_MAX_ANSWER_ATTEMPTS);
  const previousAnswer = state.answer && state.answer.trim().length > 0 ? state.answer : null;

  console.log(`[Prepare Retry] INITIALIZED | Completed attempts: ${completed}/${maxAttempts}`);

  const retryFeedback = [
    "The previous answer failed the final quality check and could not be delivered.",
    "Generate a fresh answer that directly addresses the user's original question, stays within the available evidence, and follows the required output format.",
    "Do not repeat the previous answer if it has the same problem.",
  ].join(" ");

  console.log(`[Prepare Retry] FINALIZED | Next attempt: ${completed + 1}/${maxAttempts}`);

  return {
    previousAnswer,
    retryFeedback,
    answer: "",
    checkedAnswer: "",
    finalAnswer: "",
    checkerPassed: false,
    checkerError: null,
  };
}

/** Returns the fixed user-facing fallback after the checker exhausts retries. */
export function fallbackResponseNode(state: ChatbotStateType) {
  const maxAttempts = Math.max(1, state.maxAnswerAttempts || DEFAULT_MAX_ANSWER_ATTEMPTS);
  const reason =
    state.checkerError ?? `Answer checker rejected the answer after ${maxAttempts} attempt(s).`;

  console.log(`[Fallback Response] INITIALIZED | Attempts: ${state.answerAttempts}/${maxAttempts}`);
  console.warn(`[Fallback Response] Reason: ${truncateForLog(reason, 200)}`);
  console.log("[Fallback Response] FINALIZED | Returning the fixed fallback answer");

  return {
    finalAnswer: FALLBACK_ANSWER,
    checkedAnswer: FALLBACK_ANSWER,
  };
}

// --------------------------------------------------
// Conditional routes
// --------------------------------------------------

/** Routes out-of-scope requests around research and answer generation. */
export function routeAfterAnalyzer(state: ChatbotStateType): "in_scope" | "out_of_scope" {
  return state.outOfScope || isOutOfScopeQuery(state.analyzerQuery ?? "")
    ? "out_of_scope"
    : "in_scope";
}

/**
 * Passes a checked answer, retries a rejected one while attempts remain, and
 * falls back once the graph-level attempt budget is exhausted.
 */
export function routeAfterChecker(state: ChatbotStateType): "pass" | "retry" | "exhausted" {
  const finalAnswer = state.finalAnswer?.trim() ?? "";
  const passed = state.checkerPassed && finalAnswer.length > 0 && !isFallbackAnswer(finalAnswer);

  if (passed) {
    return "pass";
  }

  const attempts = Math.max(0, state.answerAttempts || 0);
  const maxAttempts = Math.max(1, state.maxAnswerAttempts || DEFAULT_MAX_ANSWER_ATTEMPTS);

  return attempts >= maxAttempts ? "exhausted" : "retry";
}
