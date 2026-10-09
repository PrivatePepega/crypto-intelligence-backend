import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../config/database.js";

import { observerConfigs } from "./weather.config.js";
import { runObserver } from "./observer/observer.js";

import { getDailySet } from "../utils/weather/observations.js";
import { runTriage } from "./triage/triage.js";
import { runResearcher } from "./researcher/researcher.js";

export async function runWeather(): Promise<void> {
  const intelligenceSet = await getDailySet();



  const cryptoDomain = observerConfigs.crypto;

  // await runObserver(intelligenceSet, cryptoDomain);
  // await runTriage(intelligenceSet, cryptoDomain.domain);
  await runResearcher(intelligenceSet, cryptoDomain.domain);




}








const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runWeather()
    .catch((error) => {
      console.error("Weather run failed:", error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
