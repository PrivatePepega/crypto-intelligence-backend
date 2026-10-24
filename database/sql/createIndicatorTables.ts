import pool from "../../config/database.js";

const createIndicatorTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS indicator.indicators (
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
      historical_time_unit TEXT NOT NULL
        CHECK (historical_time_unit IN ('d', 'm', 'o', 'q')),

      use TEXT NOT NULL,
      purpose TEXT NOT NULL,
      significance TEXT NOT NULL,

      relation_tags TEXT[] NOT NULL DEFAULT '{}',

      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),

      embedding vector(1536)
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS indicators_series_id_unique
    ON indicator.indicators (series_id);
  `);

  console.log("✓ indicator.indicators ready");
};

createIndicatorTable()
  .catch((error) => {
    console.error("Indicator table creation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });