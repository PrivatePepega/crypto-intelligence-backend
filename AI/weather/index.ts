import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../config/database.js";

import { observerConfigs } from "./observer/observer.config.js";
import { runObserver } from "./observer/observer.js";

import { getDailySet, insertObservations } from "../utils/weather/observations.js";




export async function runWeather(): Promise<void> {
  const intelligenceSet = await getDailySet();



  const cryptoObservations = await runObserver(observerConfigs.crypto);
  await insertObservations(intelligenceSet, observerConfigs.crypto.domain, cryptoObservations);
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
