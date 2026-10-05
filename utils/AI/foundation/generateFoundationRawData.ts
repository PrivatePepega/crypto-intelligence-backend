import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodingForModel } from "js-tiktoken";
import type { PoolClient } from "pg";

import pool from "../../../config/database.js";
import { observerConfigs } from "../observer/observer.config.js";

/** The slice of an Observer domain config this generator reads. */
type ObserverDomainConfig = {
  foundationalData: string[];
};

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Artifacts land beside the generator, at `utils/AI/configRawData`.
 *
 * Resolved from this module's location rather than hardcoded to an absolute
 * machine path, so the script runs for anyone who clones the repo.
 */
const OUTPUT_DIR = path.resolve(MODULE_DIR, "../configRawData");

/**
 * Created once, deliberately.
 *
 * `encodingForModel` builds a fresh tokenizer, so calling it per dataset would
 * repeat that work 17 times for no reason. The token counts themselves are
 * still measured per dataset, from that dataset's own serialized bytes.
 */
const tokenizer = encodingForModel("gpt-4o");

/**
 * `observer.config.js` names datasets in camelCase (`btcSpotEtf`), but the
 * physical tables in the `current` schema are snake_case (`btc_spot_etf`).
 * Every configured name therefore failed an exact `table_name` match, which is
 * why all 17 first reported as missing.
 */
const toSnakeCase = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/**
 * One configured name does not follow the casing rule, because the physical
 * table leads with the asset while the configured name leads with the provider:
 *
 *   binanceBtcusdt  ->  btcusdt_binance_trader_positioning
 *
 * The asset is recoverable from the configured name alone, and the candidate is
 * still checked against the real table list before use - so this proposes a
 * name, it does not assert one.
 */
const toBinanceAssetTable = (name: string): string | null => {
  const match = /^binance([A-Za-z0-9]+)$/.exec(name);

  const asset = match?.[1];

  return asset ? `${asset.toLowerCase()}_binance_trader_positioning` : null;
};

/** Outcome of resolving one configured name. */
type Resolution =
  | { resolved: true; via: string; table: string }
  | { resolved: false; candidates: string[] };

/**
 * Resolves one configured dataset name to a physical table in `current`.
 *
 * Gives up rather than falling back to a similarly-named table. That
 * distinction matters: `sp500` has no table, but `sp500_ig_sentiment` does - and
 * that table measures trader sentiment, not the index, so quietly substituting
 * it would hand the model the wrong dataset.
 */
const resolveTable = (
  configuredName: string,
  availableTables: Set<string>,
): Resolution => {
  const candidates: { via: string; table: string }[] = [
    { via: "exact", table: configuredName },
    { via: "snake_case", table: toSnakeCase(configuredName) },
  ];

  const binance = toBinanceAssetTable(configuredName);

  if (binance) {
    candidates.push({ via: "binance_asset_prefix", table: binance });
  }

  const match = candidates.find((candidate) =>
    availableTables.has(candidate.table),
  );

  if (match) {
    return { resolved: true, via: match.via, table: match.table };
  }

  return {
    resolved: false,
    candidates: candidates.map((candidate) => candidate.table),
  };
};

/** Every table in the `current` schema, fetched once. */
const listCurrentTables = async (
  client: PoolClient,
): Promise<Set<string>> => {
  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'current'
      ORDER BY table_name
    `,
  );

  return new Set(result.rows.map((row) => row.table_name));
};

/** Metadata columns, kept in one place so the SELECT and the row type agree. */
const METADATA_COLUMNS = `
  id, name, domain, category, description, source, series_id,
  native_time_unit, native_frequency, native_aggregation, unit,
  use, purpose, significance, relation_tags, status
`;

type IndicatorMetadata = {
  id: string;
  series_id: string;
  name: string;
};

/** The artifact written to `configRawData/<domain>.json`. */
type FoundationRawData = {
  domain: string;
  generatedAt: string;
  tokenization: {
    model: string;
    encoding: string;
  };
  summary: {
    configuredDatasetCount: number;
    datasetCount: number;
    missingDatasetCount: number;
    emptyDatasetCount: number;
    totalTokens: number;
  };
  missingTables: string[];
  missingDetails: {
    configured: string;
    reason: string;
    candidatesTried: string[];
  }[];
  emptyTables: {
    configured: string;
    table: string;
  }[];
  datasets: Record<string, unknown>;
};

/**
 * Indicator metadata for the series a current table actually carries.
 *
 * The join key is `series_id`, taken from the table's own rows - not the table
 * name. `WHERE id = $1 OR series_id = $1` against a table name can never match:
 * `current.btc_spot_etf.indicator` is `btc_spot_etf`, which is not an
 * `indicators.id` (verified - that join returns null), while its `series_id` is
 * `spot_etf_btc`, which is. This mirrors the foreign key declared in
 * `database/sql/current/*.sql`.
 */
const getIndicatorMetadata = async (
  client: PoolClient,
  seriesIds: string[],
): Promise<IndicatorMetadata[]> => {
  if (seriesIds.length === 0) {
    return [];
  }

  const result = await client.query<IndicatorMetadata>(
    `
      SELECT ${METADATA_COLUMNS}
      FROM indicator.indicators
      WHERE series_id = ANY($1::text[])
      ORDER BY id
    `,
    [seriesIds],
  );

  return result.rows;
};

export const generateFoundationRawData = async (
  domain = "crypto",
): Promise<FoundationRawData> => {
  const config = (observerConfigs as Record<string, ObserverDomainConfig | undefined>)[
    domain
  ];

  if (!config) {
    throw new Error(`Unknown observer domain: ${domain}`);
  }

  if (!Array.isArray(config.foundationalData)) {
    throw new Error(
      `Observer domain "${domain}" does not have a valid foundationalData array`,
    );
  }

  const client = await pool.connect();

  try {
    const availableTables = await listCurrentTables(client);

    const datasets: Record<string, unknown> = {};
    const missingTables: string[] = [];

    const missingDetails: FoundationRawData["missingDetails"] = [];

    const emptyTables: FoundationRawData["emptyTables"] = [];

    let totalTokens = 0;

    for (const configuredName of config.foundationalData) {
      const resolution = resolveTable(configuredName, availableTables);

      if (!resolution.resolved) {
        missingTables.push(configuredName);

        missingDetails.push({
          configured: configuredName,
          reason: "no table in schema 'current' matches this name",
          candidatesTried: resolution.candidates,
        });

        continue;
      }

      const tableResult = await client.query<Record<string, unknown>>(
        `SELECT * FROM current."${resolution.table}"`,
      );

      const rows = tableResult.rows;

      if (rows.length === 0) {
        emptyTables.push({
          configured: configuredName,
          table: resolution.table,
        });
      }

      const seriesIds = [
        ...new Set(
          rows
            .map((row) => row.series_id)
            .filter(
              (value): value is string =>
                typeof value === "string" && value !== "",
            ),
        ),
      ];

      const metadata = await getIndicatorMetadata(client, seriesIds);

      const dataset = {
        metadata,
        data: rows,
      };

      /*
       * Count tokens on the exact serialized dataset that will be included in
       * the final foundation context. Measured per dataset, from this dataset's
       * own bytes - not from an approximation.
       */
      const serializedDataset = JSON.stringify(dataset);

      const tokens = tokenizer.encode(serializedDataset).length;

      datasets[configuredName] = {
        table: resolution.table,
        resolvedVia: resolution.via,
        rowCount: rows.length,
        metadata,
        data: rows,
        tokens,
      };

      totalTokens += tokens;
    }

    const result = {
      domain,
      generatedAt: new Date().toISOString(),
      tokenization: {
        model: "gpt-4o",
        encoding: "o200k_base",
      },
      summary: {
        configuredDatasetCount: config.foundationalData.length,
        datasetCount: Object.keys(datasets).length,
        missingDatasetCount: missingTables.length,
        emptyDatasetCount: emptyTables.length,
        totalTokens,
      },
      missingTables,
      missingDetails,
      emptyTables,
      datasets,
    };

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const outputPath = path.join(OUTPUT_DIR, `${domain}.json`);

    await fs.writeFile(
      outputPath,
      JSON.stringify(result, null, 2),
      "utf8",
    );

    return result;
  } finally {
    client.release();
  }
};

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const domain = process.argv[2] ?? "crypto";

  generateFoundationRawData(domain)
    .then((result) => {
      console.log(`Generated ${result.domain} foundation data`);
      console.log(`  Datasets resolved : ${result.summary.datasetCount}`);
      console.log(`  Missing           : ${result.summary.missingDatasetCount}`);
      console.log(`  Empty             : ${result.summary.emptyDatasetCount}`);
      console.log(`  Total tokens      : ${result.summary.totalTokens}`);

      if (result.missingTables.length > 0) {
        console.log("");
        console.log("  Unresolved configured datasets:");
        for (const detail of result.missingDetails) {
          console.log(
            `    ${detail.configured} (tried: ${detail.candidatesTried.join(", ")})`,
          );
        }
      }

      if (result.emptyTables.length > 0) {
        console.log("");
        console.log("  Resolved but holding no rows:");
        for (const empty of result.emptyTables) {
          console.log(`    ${empty.configured} -> current.${empty.table}`);
        }
      }
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}