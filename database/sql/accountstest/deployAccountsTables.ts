import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlDirectory = path.join(
  __dirname,
  "../../sql/accountstest",
);

const deployAccountsTables = async () => {
  console.log("Accounts SQL deployment initialized");

  const files = (await fs.readdir(sqlDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const filePath = path.join(sqlDirectory, file);
    const sql = await fs.readFile(filePath, "utf-8");

    await pool.query(sql);

    console.log(`✓ Deployed ${file}`);
  }

  console.log("Accounts SQL deployment complete");
};

deployAccountsTables()
  .catch((error) => {
    console.error("Accounts SQL deployment failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });