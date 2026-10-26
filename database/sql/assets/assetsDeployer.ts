import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlDirectory = path.join(__dirname, "../assets");

const deployAssetsTables = async () => {
  console.log("Assets SQL deployment initialized");

  const files = (await fs.readdir(sqlDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No SQL files found in the Assets directory");
    return;
  }

  for (const file of files) {
    const filePath = path.join(sqlDirectory, file);
    const sql = await fs.readFile(filePath, "utf-8");

    await pool.query(sql);

    console.log(`✓ Deployed ${file}`);
  }

  console.log("Assets SQL deployment complete");
};

deployAssetsTables()
  .catch((error) => {
    console.error("Assets SQL deployment failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });