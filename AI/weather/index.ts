import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../config/database.js";

import { observerConfigs } from "./observer/observer.config.js";
import { runObserver } from "./observer/observer.js";

import { getDailySet, insertObservations } from "../utils/weather/observations.js";
import { runTriage } from "./triage/triage.js";

export async function runWeather(): Promise<void> {
  // The one id that chains a day's work together. The Observer files its
  // observations under it and Triage reads the same set back, so both halves act
  // on exactly the rows belonging to today rather than on whatever happens to
  // carry today's date.
  const intelligenceSet = await getDailySet();

  // const cryptoObservations = await runObserver(observerConfigs.crypto);
  // await insertObservations(intelligenceSet, observerConfigs.crypto.domain, cryptoObservations);
  await runTriage(intelligenceSet, observerConfigs.crypto.domain);




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
