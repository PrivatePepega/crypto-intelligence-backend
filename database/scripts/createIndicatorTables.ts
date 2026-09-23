import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import pool from "../../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indicatorDirectory = path.resolve(
  __dirname,
  "../injection/indicator",
);

const createIndicatorTable = async (indicatorId: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(indicatorId)) {
    throw new Error(
      `Invalid indicator id "${indicatorId}". Indicator IDs must contain only lowercase letters, numbers, and underscores.`,
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS indicator."${indicatorId}" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,

      source TEXT NOT NULL,
      series_id TEXT NOT NULL,

      native_time_unit TEXT NOT NULL,
      native_frequency TEXT NOT NULL,
      native_aggregation TEXT NOT NULL,
      unit TEXT NOT NULL,

      use TEXT NOT NULL,
      purpose TEXT NOT NULL,
      significance TEXT NOT NULL,

      relation_tags TEXT[] NOT NULL DEFAULT '{}',

      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),

      embedding vector(1536)
    );
  `);
};

const createIndicatorTables = async () => {
  const files = fs
    .readdirSync(indicatorDirectory)
    .filter((file) => file.endsWith(".ts"))
    .sort();

  console.log(`Found ${files.length} indicator files.`);

  for (const file of files) {
    const filePath = path.join(indicatorDirectory, file);
    const module = await import(pathToFileURL(filePath).href);

    const indicator = Object.values(module)[0] as {
      id: string;
    };

    if (!indicator?.id) {
      throw new Error(`No indicator id found in ${file}`);
    }

    await createIndicatorTable(indicator.id);

    console.log(`✓ Created indicator.${indicator.id}`);
  }

  console.log("\nIndicator table creation complete.");
};

createIndicatorTables()
  .catch((error) => {
    console.error("Indicator table creation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });