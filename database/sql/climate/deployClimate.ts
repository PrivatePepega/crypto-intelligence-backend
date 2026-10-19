import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlDirectory = path.join(
  __dirname,
  "../climate",
);

const deployClimateTables = async () => {
  console.log("Climate SQL deployment initialized");

  const files = (await fs.readdir(sqlDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No SQL files found in the Climate directory");
    return;
  }

  for (const file of files) {
    const filePath = path.join(sqlDirectory, file);
    const sql = await fs.readFile(filePath, "utf-8");

    await pool.query(sql);

    console.log(`✓ Deployed ${file}`);
  }

  console.log("Climate SQL deployment complete");
};

deployClimateTables()
  .catch((error) => {
    console.error("Climate SQL deployment failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });