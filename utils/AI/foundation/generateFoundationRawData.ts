import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodingForModel } from "js-tiktoken";

import pool from "../../../config/database.js";
import { observerConfigs } from "../observer/observer.config.js";

const OUTPUT_DIR =
  "C:\\Users\\maxfe\\OneDrive\\Desktop\\crypto Backend\\crypto-intelligence-backend\\utils\\AI\\configRawData";

const tokenizer = encodingForModel("gpt-4o");

const getTableExists = async (client, tableName) => {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'current'
          AND table_name = $1
      ) AS exists
    `,
    [tableName],
  );

  return result.rows[0].exists;
};

const getIndicatorMetadata = async (client, tableName) => {
  const result = await client.query(
    `
      SELECT
        id,
        name,
        domain,
        category,
        description,
        source,
        series_id,
        native_time_unit,
        native_frequency,
        native_aggregation,
        unit,
        use,
        purpose,
        significance,
        relation_tags,
        status
      FROM indicator.indicators
      WHERE id = $1
         OR series_id = $1
      LIMIT 1
    `,
    [tableName],
  );

  return result.rows[0] ?? null;
};

export const generateFoundationRawData = async (domain = "crypto") => {
  const config = observerConfigs[domain];

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
    const datasets = {};
    const missingTables = [];

    let totalTokens = 0;

    for (const tableName of config.foundationalData) {
      const tableExists = await getTableExists(client, tableName);

      if (!tableExists) {
        missingTables.push(tableName);
        continue;
      }

      const metadata = await getIndicatorMetadata(
        client,
        tableName,
      );

      const tableResult = await client.query(
        `SELECT * FROM current."${tableName}"`,
      );

      const dataset = {
        metadata,
        data: tableResult.rows,
      };

      /*
       * Count tokens on the exact serialized dataset that
       * will be included in the final foundation context.
       */
      const serializedDataset = JSON.stringify(dataset);

      const tokens = tokenizer.encode(
        serializedDataset,
      ).length;

      datasets[tableName] = {
        ...dataset,
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
        configuredDatasetCount:
          config.foundationalData.length,

        datasetCount: Object.keys(datasets).length,

        missingDatasetCount: missingTables.length,

        totalTokens,
      },

      missingTables,

      datasets,
    };

    await fs.mkdir(OUTPUT_DIR, {
      recursive: true,
    });

    const outputPath = path.join(
      OUTPUT_DIR,
      `${domain}.json`,
    );

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
      console.log(
        `Generated ${result.domain} foundation data`,
      );

      console.log(
        `Datasets: ${result.summary.datasetCount}`,
      );

      console.log(
        `Missing: ${result.summary.missingDatasetCount}`,
      );

      console.log(
        `Total tokens: ${result.summary.totalTokens}`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}