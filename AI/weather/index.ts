import pool from "../../config/database.js";

import { observerConfigs } from "./observer/observer.config.js";
import { runObserver } from "./observer/observer.js";

export async function runWeather() {
  const { rows } = await pool.query(
    `
      INSERT INTO intelligence_sets.daily_sets (set_date)
      VALUES (CURRENT_DATE)
      ON CONFLICT (set_date)
      DO UPDATE SET set_date = EXCLUDED.set_date
      RETURNING id, set_date;
    `,
  );

  const intelligenceSet = rows[0];

  console.log(
    `Intelligence set created: ${intelligenceSet.id} (${intelligenceSet.set_date})`,
  );

  await runObserver(observerConfigs.crypto);
}

runWeather()
  .catch((error) => {
    console.error("Weather run failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });