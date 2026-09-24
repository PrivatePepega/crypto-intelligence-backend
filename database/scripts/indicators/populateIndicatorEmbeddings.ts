import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import OpenAI from "openai";

import pool from "../../../config/database.js";

import {
  indicatorSchema,
} from "../../../types/database/indicator/indicatorMetaData.types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indicatorDirectory = path.resolve(
  __dirname,
  "../injection/indicators",
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const embeddingModel = "text-embedding-3-small";

const buildEmbeddingText = (
  indicator: ReturnType<typeof indicatorSchema.parse>,
) => {
  return [
    `Name: ${indicator.name}`,
    `Description: ${indicator.description}`,
    `Use: ${indicator.use}`,
    `Purpose: ${indicator.purpose}`,
    `Significance: ${indicator.significance}`,
    `Relation Tags: ${indicator.relationTags.join(", ")}`,
  ].join("\n\n");
};

const populateIndicatorEmbeddings = async () => {
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

    const embeddingText = buildEmbeddingText(indicator);

    console.log(`Embedding: ${indicator.id}`);

    const response = await openai.embeddings.create({
      model: embeddingModel,
      input: embeddingText,
      dimensions: 1536,
    });

    const embedding = response.data[0]?.embedding;

    if (!embedding) {
      throw new Error(
        `No embedding returned for indicator: ${indicator.id}`,
      );
    }

    if (embedding.length !== 1536) {
      throw new Error(
        `Unexpected embedding dimension for ${indicator.id}: ${embedding.length}`,
      );
    }

    await pool.query(
      `
        UPDATE indicator.indicators
        SET embedding = $1
        WHERE id = $2
      `,
      [
        `[${embedding.join(",")}]`,
        indicator.id,
      ],
    );

    console.log(`✓ Embedded: ${indicator.id}`);
  }

  console.log("\nIndicator embedding population complete.");
};

populateIndicatorEmbeddings()
  .catch((error) => {
    console.error("Indicator embedding population failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });