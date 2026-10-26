import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import pool from "../../../config/database.js";

import { indicatorSchema } from "../../../types/database/indicator/indicatorMetaData.types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indicatorDirectory = path.resolve(__dirname, "../../injection/indicators");

const populateIndicatorMetadata = async () => {
  const files = fs
    .readdirSync(indicatorDirectory)
    .filter((file) => file.endsWith(".ts"))
    .sort();

  console.log(`Found ${files.length} indicator files.`);

  for (const file of files) {
    const filePath = path.join(indicatorDirectory, file);

    const module = await import(pathToFileURL(filePath).href);

    const rawIndicator = Object.values(module)[0];

    const indicator = indicatorSchema.parse(rawIndicator);

    await pool.query(
      `
        INSERT INTO indicator.indicators (
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
          historical_time_unit,

          use,
          purpose,
          significance,

          relation_tags,
          status,
          embedding
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18
        )
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          domain = EXCLUDED.domain,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          source = EXCLUDED.source,
          series_id = EXCLUDED.series_id,
          native_time_unit = EXCLUDED.native_time_unit,
          native_frequency = EXCLUDED.native_frequency,
          native_aggregation = EXCLUDED.native_aggregation,
          unit = EXCLUDED.unit,
          historical_time_unit = EXCLUDED.historical_time_unit,
          use = EXCLUDED.use,
          purpose = EXCLUDED.purpose,
          significance = EXCLUDED.significance,
          relation_tags = EXCLUDED.relation_tags,
          status = EXCLUDED.status
      `,
      [
        indicator.id,
        indicator.name,
        indicator.domain,
        indicator.category,
        indicator.description,

        indicator.source,
        indicator.seriesId,

        indicator.nativeTimeUnit,
        indicator.nativeFrequency,
        indicator.nativeAggregation,
        indicator.unit,
        indicator.historicalTimeUnit,

        indicator.use,
        indicator.purpose,
        indicator.significance,

        indicator.relationTags,
        indicator.status,
        indicator.embedding,
      ],
    );

    console.log(`✓ Populated indicator: ${indicator.id}`);
  }

  console.log("\nIndicator metadata population complete.");
};

populateIndicatorMetadata()
  .catch((error) => {
    console.error("Indicator metadata population failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
