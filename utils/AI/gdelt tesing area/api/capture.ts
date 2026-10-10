import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Probe-only helpers: record raw responses and summarise their shape.
 *
 * Nothing here belongs in the shipped client. Its purpose is to leave evidence
 * on disk next to whatever normalizer gets written from it, so the two can be
 * compared later.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const RAW_DIR = join(HERE, "..", "raw output");

/** Writes a record to `raw output/<slug>.json` and returns the path. */
export const captureRaw = (slug: string, record: unknown): string => {
  mkdirSync(RAW_DIR, { recursive: true });

  const file = join(RAW_DIR, `${slug}.json`);

  writeFileSync(file, JSON.stringify(record, null, 2), "utf8");

  return file;
};

/** Renders a value as a compact type name. */
const typeName = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
};

/**
 * Describes the shape of a value as a nested string.
 *
 * Recurses through objects and into the first element of arrays, so an array of
 * 250 articles costs one description rather than 250 lines.
 */
export const describeShape = (value: unknown, depth = 0): string => {
  if (depth > 4) {
    return "...";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "array(0)[]";
    }

    const inner = describeShape(value[0], depth + 1);

    return `array(${value.length})<${inner}>`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      return "{}";
    }

    const fields = entries
      .map(([key, field]) => `${key}: ${describeShape(field, depth + 1)}`)
      .join(", ");

    return `{${fields}}`;
  }

  if (typeof value === "string") {
    const preview = value.length > 24 ? `${value.slice(0, 24)}...` : value;

    return `string(${JSON.stringify(preview)})`;
  }

  return typeName(value);
};

/** Prints a titled section banner. */
export const banner = (title: string): void => {
  process.stdout.write(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}\n`);
};

/** Prints a sub-heading. */
export const subhead = (title: string): void => {
  process.stdout.write(`\n--- ${title}\n`);
};
