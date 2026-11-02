import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { encodingForModel } from "js-tiktoken";

import pool from "../../../config/database.js";
import { indicatorSchema, type Indicator } from "../../../types/database/indicator/indicatorMetaData.types.js";

/**
 * Exports the full indicator catalogue from PostgreSQL to JSON.
 *
 * Source: the `indicator.indicators` table - the single registry every other
 * layer references.
 *
 * Output conforms to the repo's own `Indicator` schema
 * (`types/database/indicator/indicatorMetaData.types.ts`), so each entry is
 * camelCased to match: `seriesId`, `nativeTimeUnit`, `relationTags`, and so on.
 * Every row is validated against that schema before it is written, so a drifting
 * database surfaces here rather than as a bad read downstream.
 *
 * ## Size
 *
 * Measured 2026-10-05 across 106 indicators:
 *
 *   metadata only (default)           : ~0.20 MB
 *   including the `embedding` vectors : ~2.1 MB compact, ~3.7 MB pretty-printed
 *
 * The `embedding` column is 1,536 floats per row and accounts for roughly 91% of
 * the full export. It is excluded by default: it is a derived vector for cosine
 * similarity, not descriptive metadata, and it is of no use to a language model
 * reading the file. Semantic search already runs against the column directly in
 * PostgreSQL.
 *
 * Pass `--with-embedding` if the vectors are actually needed:
 *
 * npx tsx utils/AI/exposeIndicators.ts --with-embedding
 *
 * Run: npx tsx utils/AI/exposeIndicators.ts
 */

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Resolved from this module's location, not hardcoded to a machine path. */
const OUTPUT_DIR = path.resolve(MODULE_DIR, "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "indicatorData.json");

/** Raw row as stored - snake_case, and `embedding` as a Postgres vector string. */
type IndicatorRow = {
  id: string;
  name: string;
  domain: string;
  category: string;
  description: string;
  source: string;
  series_id: string;
  native_time_unit: string;
  native_frequency: string;
  native_aggregation: string;
  historical_time_unit: string;
  unit: string;
  use: string;
  purpose: string;
  significance: string;
  relation_tags: string[];
  status: string;
  embedding: string | null;
};

export type IndicatorDataExport = {
  generatedAt: string;
  source: string;
  count: number;
  /** False when the export was run without `--with-embedding`. */
  includesEmbedding: boolean;
  tokenization: {
    model: string;
    encoding: string;
    /** Fields whose serialized form is measured, in the order they are sent. */
    fields: readonly string[];
    /** Sum of every indicator's `tokenCount`. */
    totalTokens: number;
  };
  /** Rows that failed `indicatorSchema` validation. Empty on a clean export. */
  invalid: { id: string; issues: string[] }[];
  indicators: ExportedIndicator[];
};

/**
 * An indicator plus its measured context cost.
 *
 * `tokenCount` is not part of the `Indicator` schema - it is derived at export
 * time, not stored in PostgreSQL.
 */
export type ExportedIndicator = Indicator & {
  tokenCount: number;
};

/**
 * The fields an indicator's token count covers.
 *
 * These are the descriptive fields that would actually be worth placing in a
 * prompt. Deliberately excluded: `relationTags` (a lookup vocabulary rather
 * than prose), `status`, `id`/`seriesId` (identifiers), and `embedding`.
 */
export const TOKENIZED_FIELDS = [
  "name",
  "description",
  "nativeTimeUnit",
  "nativeFrequency",
  "historicalTimeUnit",
  "unit",
  "use",
  "purpose",
  "significance",
] as const satisfies readonly (keyof Indicator)[];

/**
 * Created once at module load, not per indicator.
 *
 * `encodingForModel` builds the BPE ranks table, so calling it inside the loop
 * would repeat that work 106 times for no benefit.
 *
 * gpt-4o / o200k_base matches the convention already used in
 * `utils/tokenCounter.ts` and in the foundation raw-data export.
 */
const tokenizer = encodingForModel("gpt-4o");

/**
 * Measures one indicator's descriptive payload.
 *
 * Counted from the serialized form of exactly these fields, labelled by key, so
 * the count reflects what a prompt would actually carry rather than an
 * ambiguous concatenation. This mirrors how the foundation export measures its
 * datasets.
 */
const countTokens = (indicator: Indicator): number => {
  const payload: Record<string, string> = {};

  for (const field of TOKENIZED_FIELDS) {
    payload[field] = indicator[field];
  }

  return tokenizer.encode(JSON.stringify(payload)).length;
};

/**
 * pgvector has no pg type parser, so a `vector` arrives as its text form
 * `"[0.1,0.2,...]"`. That is valid JSON, so it parses directly.
 */
const parseEmbedding = (value: string | null): number[] | null => {
  if (value === null || value === "") {
    return null;
  }

  try {
    return JSON.parse(value) as number[];
  } catch {
    return null;
  }
};

/** snake_case row -> the camelCased shape `indicatorSchema` expects. */
const toIndicator = (row: IndicatorRow): Indicator => ({
  id: row.id,
  name: row.name,
  domain: row.domain,
  category: row.category,
  description: row.description,
  source: row.source,
  seriesId: row.series_id,
  nativeTimeUnit: row.native_time_unit,
  nativeFrequency: row.native_frequency,
  nativeAggregation: row.native_aggregation,
  historicalTimeUnit: row.historical_time_unit as Indicator["historicalTimeUnit"],
  unit: row.unit,
  use: row.use,
  purpose: row.purpose,
  significance: row.significance,
  relationTags: row.relation_tags ?? [],
  status: row.status as Indicator["status"],
  embedding: parseEmbedding(row.embedding),
});

/** A validated indicator plus its token count. */
const withTokenCount = (indicator: Indicator): ExportedIndicator => ({
  ...indicator,
  tokenCount: countTokens(indicator),
});

export const exposeIndicators = async (
  options: { includeEmbedding?: boolean } = {},
): Promise<IndicatorDataExport> => {
  // Off by default - see the note on size above.
  const includeEmbedding = options.includeEmbedding ?? false;

  const client = await pool.connect();

  try {
    const result = await client.query<IndicatorRow>(
      `
        SELECT
          id, name, domain, category, description, source,
          series_id,
          native_time_unit, native_frequency, native_aggregation,
          historical_time_unit,
          unit,
          use, purpose, significance,
          relation_tags, status,
          embedding::text AS embedding
        FROM indicator.indicators
        ORDER BY id
      `,
    );

    const invalid: { id: string; issues: string[] }[] = [];

    const indicators: Indicator[] = [];

    for (const row of result.rows) {
      const candidate = toIndicator(row);

      const parsed = indicatorSchema.safeParse(candidate);

      if (parsed.success) {
        indicators.push(parsed.data);
      } else {
        invalid.push({
          id: row.id,
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          ),
        });

        // Kept rather than dropped, so a schema drift is visible in the file
        // instead of silently shrinking the catalogue.
        indicators.push(candidate);
      }
    }

    // Embeddings are stripped after the token count is measured, so the count
    // never depends on whether they were exported.
    const exported: ExportedIndicator[] = indicators.map((indicator) =>
      withTokenCount(indicator),
    );

    const payload: ExportedIndicator[] = includeEmbedding
      ? exported
      : exported.map((indicator) => ({ ...indicator, embedding: null }));

    const data: IndicatorDataExport = {
      generatedAt: new Date().toISOString(),
      source: "indicator.indicators",
      count: payload.length,
      includesEmbedding: includeEmbedding,
      tokenization: {
        model: "gpt-4o",
        encoding: "o200k_base",
        fields: TOKENIZED_FIELDS,
        totalTokens: payload.reduce(
          (total, indicator) => total + indicator.tokenCount,
          0,
        ),
      },
      invalid,
      indicators: payload,
    };

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    await fs.writeFile(OUTPUT_FILE, JSON.stringify(data, null, 2), "utf8");

    return data;
  } finally {
    client.release();
  }
};

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const includeEmbedding = process.argv.includes("--with-embedding");

  exposeIndicators({ includeEmbedding })
    .then((data) => {
      console.log(`Exported ${data.count} indicators`);

      console.log(
        `  embedding : ${data.includesEmbedding ? "included (~2 MB)" : "excluded"}`,
      );

      console.log(
        `  tokens    : ${data.tokenization.totalTokens.toLocaleString()} total ` +
          `(${data.tokenization.model} / ${data.tokenization.encoding})`,
      );

      console.log(`  invalid   : ${data.invalid.length}`);

      for (const bad of data.invalid) {
        console.log(`    ${bad.id}: ${bad.issues.join("; ")}`);
      }

      console.log(`  -> ${path.relative(process.cwd(), OUTPUT_FILE)}`);
    })
    .catch((error: unknown) => {
      console.error("Indicator export failed:", error);
      process.exitCode = 1;
    });
}