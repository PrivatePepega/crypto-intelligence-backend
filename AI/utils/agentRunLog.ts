import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// --------------------------------------------------
// Paths
// --------------------------------------------------

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Root output directory.
 *
 * Resolved from this module rather than `process.cwd()` so the destination is
 * the same no matter which script or working directory triggers a run.
 */
export const AGENT_RUN_LOG_DIR = path.resolve(
  MODULE_DIR,
  "../data",
);

/**
 * Width the run number is zero-padded to.
 *
 * Without padding a file listing sorts `10` before `2`, which makes the newest
 * run hard to find by eye. The number is parsed back off the name for
 * resolution, so padding is cosmetic only.
 */
const RUN_NUMBER_PAD = 3;

/**
 * Ceiling on name-reservation attempts.
 *
 * Only reachable if every candidate name is genuinely occupied, which means
 * either a broken filesystem or thousands of simultaneous runs. Present so the
 * retry cannot spin forever.
 */
const MAX_RESERVE_ATTEMPTS = 10_000;

/** Characters Windows rejects in a path segment. */
const ILLEGAL_PATH_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

// --------------------------------------------------
// Naming
// --------------------------------------------------

/**
 * Makes an agent name usable as a single directory / file name segment.
 *
 * Also strips trailing dots and spaces: Windows silently drops them, which
 * would mean the name we write differs from the name we later scan for.
 */
export const toPathSegment = (
  value: string,
): string => {
  const cleaned = value
    .replace(ILLEGAL_PATH_CHARS, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");

  return cleaned === ""
    ? "agent"
    : cleaned;
};

const segmentFor = toPathSegment;

const fileNameFor = (
  agentName: string,
  runNumber: number,
): string => {
  return `${segmentFor(agentName)}-${String(
    runNumber,
  ).padStart(RUN_NUMBER_PAD, "0")}.json`;
};

const agentDirectory = (
  agentName: string,
): string => {
  return path.join(
    AGENT_RUN_LOG_DIR,
    segmentFor(agentName),
  );
};

// --------------------------------------------------
// Run number resolution
// --------------------------------------------------

/**
 * Next run number for an agent: one past the highest already on disk.
 *
 * Deliberately derived from the files present rather than a stored counter, so
 * deleting the folder resets numbering to 1 and a run never overwrites an
 * earlier one.
 *
 * Gaps are not reused: with only `1` and `5` on disk the next run is `6`.
 */
export const resolveNextRunNumber = async (
  agentName: string,
): Promise<number> => {
  const directory = agentDirectory(agentName);

  let entries: string[];

  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code ===
      "ENOENT"
    ) {
      return 1;
    }

    throw error;
  }

  const prefix = `${segmentFor(agentName)}-`;
  const suffix = ".json";

  let highest = 0;

  for (const entry of entries) {
    if (
      !entry.startsWith(prefix) ||
      !entry.endsWith(suffix)
    ) {
      continue;
    }

    const digits = entry.slice(
      prefix.length,
      entry.length - suffix.length,
    );

    if (!/^\d+$/.test(digits)) {
      continue;
    }

    const parsed = Number.parseInt(digits, 10);

    if (parsed > highest) {
      highest = parsed;
    }
  }

  return highest + 1;
};

// --------------------------------------------------
// Serialization
// --------------------------------------------------

/**
 * `JSON.stringify` that cannot throw and cannot silently drop data.
 *
 * Two failure modes are covered:
 *
 *  - A circular reference throws. External payloads and SDK step objects can
 *    contain one, and a throw here would abort a write and take the agent run
 *    down with it.
 *  - A function- or symbol-valued property does *not* throw - native
 *    `JSON.stringify` simply omits the key. A plain stringify would therefore
 *    lose that data with no error at all, which is worse in a diagnostic
 *    artifact than losing it loudly.
 *
 * `ancestors` tracks the current branch rather than every object seen, so a
 * reference shared by two siblings is still serialized in full and only a true
 * cycle is labelled `[Circular]`.
 */
const safeJson = (
  value: unknown,
  space = 2,
): string => {
  try {
    const ancestors: object[] = [];

    function serialize(
      this: unknown,
      _key: string,
      entry: unknown,
    ): unknown {
      if (typeof entry === "bigint") {
        return `${entry}n`;
      }

      if (typeof entry === "function") {
        return `[Function ${
          entry.name || "anonymous"
        }]`;
      }

      if (typeof entry === "symbol") {
        return "[Symbol]";
      }

      if (
        typeof entry !== "object" ||
        entry === null
      ) {
        return entry;
      }

      // `this` is the object holding `entry`, so the ancestor stack can be
      // rewound to the branch actually being walked.
      while (
        ancestors.length > 0 &&
        ancestors[ancestors.length - 1] !==
          (this as object)
      ) {
        ancestors.pop();
      }

      if (ancestors.includes(entry)) {
        return "[Circular]";
      }

      ancestors.push(entry);

      return entry;
    }

    return (
      JSON.stringify(
        value,
        serialize,
        space,
      ) ?? "null"
    );
  } catch (error) {
    return `[unserializable: ${
      error instanceof Error
        ? error.message
        : String(error)
    }]`;
  }
};

// --------------------------------------------------
// Readable serialization
// --------------------------------------------------

/**
 * Shortest string that gets split into lines.
 *
 * Below this a string stays a string: titles, token counts and tool names are
 * more useful as values than as one-element arrays. Blank-line paragraph breaks
 * are preserved as empty strings.
 */
const MULTILINE_MIN_CHARS = 200;

/**
 * True only for object literals.
 *
 * Deliberately excludes `Date`, `RegExp`, `Map` and friends: walking those with
 * `Object.entries` would flatten them to `{}` and lose data that
 * `JSON.stringify` currently renders correctly.
 */
const isPlainObject = (
  value: object,
): boolean => {
  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
};

/**
 * Rewrites long multi-line strings as arrays of lines, one element per line.
 *
 * ## Why
 *
 * JSON cannot contain a literal newline inside a string value, so a 555-line
 * prompt is written as 29,170 characters on a single physical line with every
 * break escaped to `\n`. That is unreadable in an editor and makes the file
 * impossible to read by line or grep a paragraph out of.
 *
 * Storing the text as `string[]` restores the original line structure: blank
 * lines survive as empty strings, so paragraphs still read as paragraphs.
 *
 * ## Detection
 *
 * An array whose elements are all strings is a split block. An array of objects
 * is genuine structured data and is left alone.
 *
 * ## Cycles
 *
 * `ancestors` tracks the current branch rather than every object seen, so a
 * genuine cycle becomes `[Circular]` while a reference shared by two siblings
 * is still written out in full.
 */
const normalizeMultiline = (
  value: unknown,
  ancestors: object[] = [],
): unknown => {
  if (typeof value === "string") {
    if (
      value.length < MULTILINE_MIN_CHARS ||
      !value.includes("\n")
    ) {
      return value;
    }

    return value.split("\n");
  }

  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (ancestors.includes(value)) {
    return "[Circular]";
  }

  ancestors.push(value);

  try {
    if (Array.isArray(value)) {
      return value.map(
        (entry) =>
          normalizeMultiline(entry, ancestors),
      );
    }

    if (isPlainObject(value)) {
      const output: Record<string, unknown> = {};

      for (const [key, entry] of Object.entries(
        value,
      )) {
        output[key] = normalizeMultiline(
          entry,
          ancestors,
        );
      }

      return output;
    }

    // Non-plain object: leave it for JSON.stringify to handle natively.
    return value;
  } finally {
    ancestors.pop();
  }
};

// --------------------------------------------------
// Console capture
// --------------------------------------------------

type ConsoleMethod =
  | "log"
  | "info"
  | "warn"
  | "error"
  | "debug";

const CONSOLE_METHODS: ConsoleMethod[] = [
  "log",
  "info",
  "warn",
  "error",
  "debug",
];

/**
 * Renders one console argument as text.
 *
 * Objects are stringified rather than inspected, because the point is to
 * reproduce what a terminal would have shown.
 */
const formatConsoleArg = (
  value: unknown,
): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return (
      value.stack ??
      `${value.name}: ${value.message}`
    );
  }

  if (typeof value === "bigint") {
    return `${value}n`;
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    return safeJson(value);
  }

  if (
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return safeJson(value);
  }

  return String(value);
};

/**
 * Tees `console.log` and friends into `onLine` until the returned function is
 * called.
 *
 * Console methods are swapped rather than the output stream itself, so
 * everything reaching the terminal is still recorded. The originals are
 * restored on stop, and stop is safe to call more than once.
 *
 * Limitation: capture is process-wide, not per-agent. Concurrent agents would
 * interleave into each other's transcripts. Runs are sequential today.
 *
 * This module never calls `console` itself, so a run log cannot capture its own
 * output.
 */
export const captureConsole = (
  onLine: (line: string) => void,
): (() => void) => {
  const originals = new Map<
    ConsoleMethod,
    typeof console.log
  >();

  let stopped = false;

  for (const method of CONSOLE_METHODS) {
    const original = console[method];

    originals.set(method, original);

    console[method] = ((
      ...args: unknown[]
    ): void => {
      try {
        onLine(
          args.map(formatConsoleArg).join(" "),
        );
      } catch {
        onLine("[unrenderable console output]");
      }

      original.apply(console, args);
    }) as typeof console.log;
  }

  return () => {
    if (stopped) {
      return;
    }

    stopped = true;

    for (const method of CONSOLE_METHODS) {
      const original = originals.get(method);

      if (original) {
        console[method] = original;
      }
    }
  };
};

// --------------------------------------------------
// Run log
// --------------------------------------------------

/**
 * Sections an agent run is expected to record.
 *
 * The trailing `(string & {})` keeps completion for these while still allowing
 * an unlisted label, so a second agent does not have to edit this file.
 */
export type AgentRunSection =
  | "initializer"
  | "prompt"
  | "step"
  | "reasoning"
  | "evidence"
  | "synthesis"
  | "usage"
  | "output"
  | (string & {});

export type AgentRunEntry = {
  sequence: number;
  section: AgentRunSection;
  at: string;
  data: unknown;
};

/**
 * A long multi-line string stored one element per line.
 *
 * JSON cannot hold a literal newline inside a string, so writing a prompt as a
 * string collapses hundreds of lines onto one escaped line. Storing the lines
 * separately keeps the file readable. An array of strings is therefore a split
 * block; an array of objects is real structured data.
 */
export type MultilineBlock = string[];

/** Either an inline string or a {@link MultilineBlock}. */
export type AgentRunText = string | MultilineBlock;

/** On-disk shape of `<agent>/<agent>-<n>.json`. */
export type AgentRunDocument = {
  agentName: string;
  runNumber: number;
  file: string;
  startedAt: string;
  updatedAt: string;
  entryCount: number;
  entries: AgentRunEntry[];
  response: AgentRunText | null;
  console: AgentRunText[];
};

export type AgentRunLog = {
  readonly agentName: string;
  readonly runNumber: number;
  readonly directory: string;
  readonly filePath: string;
  /**
   * Appends a section and rewrites the file immediately.
   *
   * Persisting per record rather than at the end means a run that dies
   * mid-flight still leaves everything recorded up to that point.
   */
  record: (
    section: AgentRunSection,
    data?: unknown,
  ) => Promise<void>;
  /** Appends one line to the console transcript. */
  note: (line: string) => void;
  /** Tees the console into the transcript until the returned function runs. */
  captureConsole: () => () => void;
  /** Writes the final document and returns its path. */
  finish: (
    response?: string,
  ) => Promise<string>;
};

/**
 * Opens a numbered run log for an agent, creating its folder on demand.
 *
 * Resolves the next number from the files already present, then reserves that
 * name with an exclusive create. Reserving rather than merely checking is what
 * makes concurrent runs safe: two runs resolving the same number at the same
 * moment cannot both win, because the loser's create fails with `EEXIST` and it
 * moves on to the next number. A plain "does the file exist" pre-check loses
 * that race and silently overwrites the earlier run.
 */
export const createAgentRunLog = async (
  agentName: string,
): Promise<AgentRunLog> => {
  const directory = agentDirectory(agentName);

  await fs.mkdir(directory, { recursive: true });

  const entries: AgentRunEntry[] = [];
  const transcript: string[] = [];
  const startedAt = new Date().toISOString();

  let response: string | null = null;

  let runNumber =
    await resolveNextRunNumber(agentName);

  let filePath = "";

  let relativeFile = "";

  const buildDocument = (): AgentRunDocument => ({
    agentName,
    runNumber,
    file: relativeFile,
    startedAt,
    updatedAt: new Date().toISOString(),
    entryCount: entries.length,

    // Applied here rather than at capture time, so the transcript keeps one
    // entry per console call and only the written form is split into lines.
    entries: normalizeMultiline(
      entries,
    ) as AgentRunEntry[],

    response:
      response === null
        ? null
        : (normalizeMultiline(
            response,
          ) as AgentRunText),

    console: normalizeMultiline(
      transcript,
    ) as AgentRunText[],
  });

  // Claim the file name before anything is recorded, so ownership is settled up
  // front and every later write can safely overwrite its own file.
  for (
    let attempt = 0;
    attempt < MAX_RESERVE_ATTEMPTS;
    attempt += 1
  ) {
    const candidate = path.join(
      directory,
      fileNameFor(agentName, runNumber),
    );

    try {
      await fs.writeFile(
        candidate,
        safeJson(buildDocument()),
        {
          encoding: "utf8",
          flag: "wx",
        },
      );

      filePath = candidate;
      relativeFile =
        path
          .relative(process.cwd(), candidate)
          .split(path.sep)
          .join("/");

      break;
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !==
        "EEXIST"
      ) {
        throw error;
      }

      runNumber += 1;
    }
  }

  if (filePath === "") {
    throw new Error(
      `Could not reserve a run log file for "${agentName}" after ${MAX_RESERVE_ATTEMPTS} attempts.`,
    );
  }

  const persist = async (): Promise<void> => {
    await fs.writeFile(
      filePath,
      safeJson(buildDocument()),
      "utf8",
    );
  };

  const note = (line: string): void => {
    transcript.push(line);
  };

  const record = async (
    section: AgentRunSection,
    data?: unknown,
  ): Promise<void> => {
    entries.push({
      sequence: entries.length + 1,
      section,
      at: new Date().toISOString(),
      data: data === undefined ? null : data,
    });

    await persist();
  };

  return {
    agentName,
    runNumber,
    directory,
    filePath,

    record: async (section, data) => {
      try {
        await record(section, data);
      } catch (error) {
        // A logging failure must not abort the agent run it is describing.
        note(
          `[run log write failed for "${section}": ${
            error instanceof Error
              ? error.message
              : String(error)
          }]`,
        );
      }
    },

    note,

    captureConsole: () => captureConsole(note),

    finish: async (finalResponse) => {
      if (finalResponse !== undefined) {
        response = finalResponse;
      }

      try {
        await persist();

        return filePath;
      } catch (error) {
        note(
          `[run log final write failed: ${
            error instanceof Error
              ? error.message
              : String(error)
          }]`,
        );

        return filePath;
      }
    },
  };
};
