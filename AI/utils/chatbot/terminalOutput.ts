import { inspect } from "node:util";

export type TerminalLevel = "log" | "warn" | "error";

export type TerminalEntry = {
  at: string;
  level: TerminalLevel;
  message: string;
};

export type TerminalCapture = {
  entries: TerminalEntry[];
  restore: () => void;
};

function formatConsoleArgument(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }

  return inspect(value, { depth: 6, breakLength: 120, colors: false });
}

/**
 * Mirrors terminal output into an array while still writing it to the terminal.
 *
 * The caller can persist the captured entries in a JSON run log. Call
 * `restore()` when the run finishes so the original console methods are put
 * back.
 */
export function captureTerminalOutput(): TerminalCapture {
  const entries: TerminalEntry[] = [];
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const wrap = (level: TerminalLevel) => {
    return (...args: unknown[]) => {
      entries.push({
        at: new Date().toISOString(),
        level,
        message: args.map(formatConsoleArgument).join(" "),
      });

      original[level](...args);
    };
  };

  console.log = wrap("log");
  console.warn = wrap("warn");
  console.error = wrap("error");

  return {
    entries,
    restore: () => {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    },
  };
}
