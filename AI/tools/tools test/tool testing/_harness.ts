import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Shared harness for the tool qualifying round.
 *
 * Every tool in `AI/tools` gets a sibling test file here that calls
 * {@link runTool}. The harness owns the parts every test would otherwise
 * repeat: validating inputs, calling `execute`, timing it, writing the captured
 * payload, and describing its shape.
 *
 * ## Inputs are parsed before `execute`
 *
 * This matters more than it looks. Calling a tool's `execute` directly **skips
 * Zod**, so any `.default()` in its schema never applies. `newsMarketsNewsTool`
 * returned zero stories for exactly this reason: `limit` arrived `undefined`,
 * and `Math.max(0, undefined)` is `NaN`, so `slice(0, NaN)` produced `[]`.
 *
 * The agent runtime always parses first, so parsing here is what makes a test
 * faithful rather than more permissive. Without it a test can report an empty
 * payload that would never occur in production.
 *
 * ## dotenv is loaded here
 *
 * Some provider clients read their key at **import** time and throw if it is
 * missing - `AI/providers/webSearch/exa/client.ts` does exactly that. ES module
 * imports evaluate in declaration order and every test file imports this module
 * first, so `dotenv/config` has run before any tool module is evaluated.
 *
 * ## Failures are recorded, not thrown
 *
 * A provider being down, rate-limiting, or missing a key should not abort the
 * round. A failed call still writes a response file with `ok: false` and the
 * error, and sets a non-zero exit code so the failure shows up in a summary.
 */

/** Where captured payloads are written. */
const OUT_DIR = fileURLToPath(new URL("../tool output/", import.meta.url));

/**
 * Keys searched when hunting for the record array inside a response.
 *
 * The normalizers here settled on `{ count, items }`, but several tools predate
 * that and return a provider's own envelope, so the common container names are
 * probed rather than assumed. `indicators` covers the quantitative-data tool.
 */
const CONTAINER_KEYS = [
  "items",
  "data",
  "results",
  "articles",
  "events",
  "stories",
  "indicators",
];

/** The shape of a `tool()` result, loosened so per-tool files stay clean. */
interface LooseTool {
  description?: string;
  inputSchema?: {
    safeParse?: (
      value: unknown,
    ) => { success: boolean; data?: unknown; error?: unknown };
  };
  execute?: (
    input: never,
    options: {
      toolCallId: string;
      messages: unknown[];
      abortSignal?: AbortSignal;
      /** Supplied by the agent runtime; meaningless outside it, but the AI SDK's
       *  own types mark it required, so it is passed explicitly. */
      context?: unknown;
    },
  ) => Promise<unknown>;
}

/** Structural summary of a payload, written alongside the raw response. */
export type ToolOutputShape = {
  kind: string;
  recordCount: number | null;
  containerKey: string | null;
  topLevelKeys: string[] | null;
  recordKeys: string[] | null;
  charCount: number;
  empty: boolean;
};

const unionOfKeys = (records: unknown[]): string[] => {
  const keys = new Set<string>();

  records.slice(0, 5).forEach((entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      Object.keys(entry as object).forEach((key) => keys.add(key));
    }
  });

  return [...keys];
};

/** Describes a payload's structure without interpreting its contents. */
const describeShape = (value: unknown): ToolOutputShape => {
  const charCount = JSON.stringify(value ?? null)?.length ?? 0;

  if (Array.isArray(value)) {
    return {
      kind: "array",
      recordCount: value.length,
      containerKey: null,
      topLevelKeys: null,
      recordKeys: unionOfKeys(value),
      charCount,
      empty: value.length === 0,
    };
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;

    const topLevelKeys = Object.keys(source);

    const containerKey =
      CONTAINER_KEYS.find((key) => Array.isArray(source[key])) ?? null;

    if (containerKey) {
      const records = source[containerKey] as unknown[];

      return {
        kind: "object",
        recordCount: records.length,
        containerKey,
        topLevelKeys,
        recordKeys: unionOfKeys(records),
        charCount,
        empty: records.length === 0,
      };
    }

    return {
      kind: "object",
      recordCount: null,
      containerKey: null,
      topLevelKeys,
      recordKeys: null,
      charCount,
      empty: topLevelKeys.length === 0,
    };
  }

  return {
    kind: value === null ? "null" : typeof value,
    recordCount: null,
    containerKey: null,
    topLevelKeys: null,
    recordKeys: null,
    charCount,
    empty: value === null || value === undefined,
  };
};

/** Options for one qualifying run. */
export type RunToolOptions = {
  /** Tool's file name, without extension. Also the response file's name. */
  name: string;

  /** The exported symbol from `AI/tools/<name>.ts`. */
  tool: unknown;

  /**
   * Arguments to pass to `execute`.
   *
   * Validated through the tool's own schema before the call, so defaults apply
   * exactly as they would for the agent.
   */
  args?: Record<string, unknown>;

  /**
   * Milliseconds before the run is abandoned.
   *
   * The MCP-backed tools reach a server over HTTP at `localhost:5000`, and when
   * nothing is listening the SDK retries indefinitely rather than erroring, so
   * this is what stops one dead provider stalling the whole round.
   */
  timeoutMs?: number;
};

/** Default ceiling. Generous enough for the ~14s tag endpoint and slow MCP
 *  round trips, short enough that a hang does not stall the round. */
const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Runs one tool, captures its output, and reports on it.
 *
 * Never throws. A failure is captured into the response file and reflected in
 * the exit code.
 */
export const runTool = async (options: RunToolOptions): Promise<void> => {
  const loose = options.tool as LooseTool;

  const requested = options.args ?? {};

  const startedAt = Date.now();

  console.log("");
  console.log("=".repeat(70));
  console.log(`  ${options.name}`);
  console.log("=".repeat(70));

  let args = requested;

  let payload: unknown;

  let failure: { message: string; stack?: string } | null = null;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();

  // Both guards are needed. The signal asks the tool to stop; the race enforces
  // it, because the MCP SDK ignores an abort and keeps retrying a dead server.
  const guard = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    if (typeof loose.execute !== "function") {
      throw new Error(
        "Tool exposes no execute() - is it a tool() or a wrapper object?",
      );
    }

    // Validate exactly as the agent runtime would, so schema defaults apply.
    if (loose.inputSchema?.safeParse) {
      const parsed = loose.inputSchema.safeParse(requested);

      if (!parsed.success) {
        throw new Error(
          `Input rejected by schema: ${JSON.stringify(parsed.error).slice(0, 300)}`,
        );
      }

      args = (parsed.data ?? requested) as Record<string, unknown>;
    }

    payload = await Promise.race([
      loose.execute(args as never, {
        toolCallId: `qualify-${options.name}`,
        messages: [],
        context: undefined,
        abortSignal: controller.signal,
      }),

      new Promise<never>((_resolve, reject) => {
        // `unref()` is load-bearing, not cosmetic. Without it this timer holds
        // Node's event loop open for the full timeout after the tool has already
        // returned, so every run costs tool_time + 45s.
        setTimeout(
          () =>
            reject(
              new Error(
                `Timed out after ${timeoutMs}ms with no response. Tools reaching ` +
                  `the MCP server at localhost:5000 hang rather than error when ` +
                  `nothing is listening.`,
              ),
            ),
          timeoutMs,
        ).unref();
      }),
    ]);
  } catch (error) {
    failure = {
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof Error && error.stack
        ? { stack: error.stack.split("\n").slice(0, 4).join("\n") }
        : {}),
    };
  } finally {
    clearTimeout(guard);
  }

  const elapsedMs = Date.now() - startedAt;

  const shape = describeShape(failure ? null : payload);

  const record = {
    tool: options.name,
    capturedAt: new Date().toISOString(),
    elapsedMs,
    ok: failure === null,
    // What was asked for, and what the schema turned it into. Both matter:
    // they differ whenever a default was applied.
    args: { requested, resolved: failure ? null : args },
    ...(failure ? { error: failure } : {}),
    shape,
    response: failure ? null : payload,
  };

  await mkdir(OUT_DIR, { recursive: true });

  await writeFile(
    `${OUT_DIR}${options.name}.response.json`,
    JSON.stringify(record, null, 2),
    "utf8",
  );

  if (failure) {
    console.log(`  FAILED  ${elapsedMs}ms`);
    console.log(`    ${failure.message.replace(/\s+/g, " ").slice(0, 240)}`);

    process.exitCode = 1;
  } else {
    console.log(`  ok  ${elapsedMs}ms  ${shape.charCount} chars  ${shape.kind}`);

    if (shape.recordCount !== null) {
      console.log(
        `    records: ${shape.recordCount}` +
          (shape.containerKey ? ` (in "${shape.containerKey}")` : "") +
          (shape.empty ? "   <-- EMPTY" : ""),
      );
    }

    if (shape.recordKeys) {
      console.log(`    fields : ${shape.recordKeys.join(", ")}`);
    }

    if (shape.topLevelKeys) {
      console.log(`    keys   : ${shape.topLevelKeys.join(", ")}`);
    }
  }

  console.log(`    -> tool output/${options.name}.response.json`);
};