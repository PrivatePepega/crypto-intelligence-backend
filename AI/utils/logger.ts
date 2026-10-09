import type { LanguageModelUsage } from "ai";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Same directory as the run-log module this replaces, so "../data" still resolves
// to AI/data.
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

// --------------------------------------------------
// Run logging (JSON artifacts)
// --------------------------------------------------
//
// A numbered JSON file per run under AI/data/<agent name>/, holding the
// structured entries an agent records. See createAgentRunLog.
// --------------------------------------------------

// --------------------------------------------------
// Paths
// --------------------------------------------------

/**
 * Root output directory.
 *
 * Resolved from this module rather than `process.cwd()` so the destination is
 * the same no matter which script or working directory triggers a run.
 */
export const AGENT_RUN_LOG_DIR = path.resolve(MODULE_DIR, "../data");

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
export const toPathSegment = (value: string): string => {
  const cleaned = value
    .replace(ILLEGAL_PATH_CHARS, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");

  return cleaned === "" ? "agent" : cleaned;
};

const segmentFor = toPathSegment;

/**
 * The file name a run number resolves to, e.g. `Weather Triage-007.json`.
 *
 * Exported so anything that writes a per-run artifact alongside the run log can
 * reuse this rather than reimplementing the padding. A second copy of the format
 * is a second thing to drift: the researcher's database dump is named with this so
 * it lines up with its run log by construction, not by coincidence.
 */
export const agentRunFileName = (agentName: string, runNumber: number): string => {
  return `${segmentFor(agentName)}-${String(runNumber).padStart(RUN_NUMBER_PAD, "0")}.json`;
};

const fileNameFor = agentRunFileName;

const agentDirectory = (agentName: string): string => {
  return path.join(AGENT_RUN_LOG_DIR, segmentFor(agentName));
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
export const resolveNextRunNumber = async (agentName: string): Promise<number> => {
  const directory = agentDirectory(agentName);

  let entries: string[];

  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 1;
    }

    throw error;
  }

  const prefix = `${segmentFor(agentName)}-`;
  const suffix = ".json";

  let highest = 0;

  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith(suffix)) {
      continue;
    }

    const digits = entry.slice(prefix.length, entry.length - suffix.length);

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
const safeJson = (value: unknown, space = 2): string => {
  try {
    const ancestors: object[] = [];

    function serialize(this: unknown, _key: string, entry: unknown): unknown {
      if (typeof entry === "bigint") {
        return `${entry}n`;
      }

      if (typeof entry === "function") {
        return `[Function ${entry.name || "anonymous"}]`;
      }

      if (typeof entry === "symbol") {
        return "[Symbol]";
      }

      if (typeof entry !== "object" || entry === null) {
        return entry;
      }

      // `this` is the object holding `entry`, so the ancestor stack can be
      // rewound to the branch actually being walked.
      while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== (this as object)) {
        ancestors.pop();
      }

      if (ancestors.includes(entry)) {
        return "[Circular]";
      }

      ancestors.push(entry);

      return entry;
    }

    return JSON.stringify(value, serialize, space) ?? "null";
  } catch (error) {
    return `[unserializable: ${error instanceof Error ? error.message : String(error)}]`;
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
const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
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
const normalizeMultiline = (value: unknown, ancestors: object[] = []): unknown => {
  if (typeof value === "string") {
    if (value.length < MULTILINE_MIN_CHARS || !value.includes("\n")) {
      return value;
    }

    return value.split("\n");
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (ancestors.includes(value)) {
    return "[Circular]";
  }

  ancestors.push(value);

  try {
    if (Array.isArray(value)) {
      return value.map((entry) => normalizeMultiline(entry, ancestors));
    }

    if (isPlainObject(value)) {
      const output: Record<string, unknown> = {};

      for (const [key, entry] of Object.entries(value)) {
        output[key] = normalizeMultiline(entry, ancestors);
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
// Artifact serialization
// --------------------------------------------------

/**
 * Serializes a value into the readable JSON form used by the run logs: two space
 * indent, long multi-line strings split one element per line, and no failure
 * mode that loses data silently.
 *
 * Exposed so any artifact meant to be read gets the same treatment instead of the
 * single-line escaped wall that plain `JSON.stringify` turns a paragraph of text
 * into. Idempotent, so it is safe to apply to a document already normalized.
 */
export const toReadableJson = (value: unknown): string => safeJson(normalizeMultiline(value));

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
  | "formatter"
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
   *
   * Resolves to the entry's `sequence`, so a later entry can point back at this
   * one instead of duplicating its payload. Resolves to `0` if the write failed.
   */
  record: (section: AgentRunSection, data?: unknown) => Promise<number>;
  /** Writes the final document and returns its path. */
  finish: (response?: string) => Promise<string>;
};

/**
 * An {@link AgentRunLog} that writes nothing.
 *
 * Drop-in for {@link createAgentRunLog}, so an agent can be switched off from
 * writing to AI/data without touching any of its `record` calls. Every method is
 * a no-op and resolves successfully: the agent's control flow is identical whether
 * or not artifacts are being kept, which is the point - the alternative is
 * guarding every `record` call site and leaving the switch half-applied.
 *
 * No run number is reserved, so a silenced run leaves no gap in the sequence.
 */
export const createSilentAgentRunLog = (agentName: string): AgentRunLog => ({
  agentName,

  // Zero rather than a real number: nothing was reserved, and any agent that
  // reads these back is looking at an artifact that does not exist.
  runNumber: 0,

  directory: "",

  filePath: "",

  record: async () => 0,

  finish: async () => "",
});

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
export const createAgentRunLog = async (agentName: string): Promise<AgentRunLog> => {
  const directory = agentDirectory(agentName);

  await fs.mkdir(directory, { recursive: true });

  const entries: AgentRunEntry[] = [];
  const startedAt = new Date().toISOString();

  let response: string | null = null;

  let runNumber = await resolveNextRunNumber(agentName);

  let filePath = "";

  let relativeFile = "";

  const buildDocument = (): AgentRunDocument => {
    // Applied at write time, so only the stored form is split into lines.
    const document: AgentRunDocument = {
      agentName,
      runNumber,
      file: relativeFile,
      startedAt,
      updatedAt: new Date().toISOString(),
      entryCount: entries.length,

      entries: normalizeMultiline(entries) as AgentRunEntry[],

      response: response === null ? null : (normalizeMultiline(response) as AgentRunText),
    };

    return document;
  };

  // Claim the file name before anything is recorded, so ownership is settled up
  // front and every later write can safely overwrite its own file.
  for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt += 1) {
    const candidate = path.join(directory, fileNameFor(agentName, runNumber));

    try {
      await fs.writeFile(candidate, safeJson(buildDocument()), {
        encoding: "utf8",
        flag: "wx",
      });

      filePath = candidate;
      relativeFile = path.relative(process.cwd(), candidate).split(path.sep).join("/");

      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
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
    await fs.writeFile(filePath, safeJson(buildDocument()), "utf8");
  };

  const record = async (section: AgentRunSection, data?: unknown): Promise<number> => {
    const sequence = entries.length + 1;

    entries.push({
      sequence,
      section,
      at: new Date().toISOString(),
      data: data === undefined ? null : data,
    });

    await persist();

    return sequence;
  };

  return {
    agentName,
    runNumber,
    directory,
    filePath,

    record: async (section, data) => {
      try {
        return await record(section, data);
      } catch {
        // A logging failure must not abort the agent run it is describing, so
        // the error is swallowed rather than surfaced: with console output gone
        // there is nowhere to report it without adding back the channel we just
        // removed.
        return 0;
      }
    },

    finish: async (finalResponse) => {
      if (finalResponse !== undefined) {
        response = finalResponse;
      }

      try {
        await persist();

        return filePath;
      } catch {
        return filePath;
      }
    },
  };
};
