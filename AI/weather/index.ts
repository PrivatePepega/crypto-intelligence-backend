import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../config/database.js";

import { observerConfigs } from "./observer/observer.config.js";
import { runObserver } from "./observer/observer.js";

import { getDailySet, insertObservations } from "../utils/weather/observations.js";
import { dumpObservationsForSet } from "../utils/weather/dbFetcher.observer.js";
import { runTriage } from "./triage/triage.js";
import { runResearcher } from "./researcher/researcher.js";

export async function runWeather(): Promise<void> {
  // The one id that chains a day's work together. The Observer files its
  // observations under it and Triage reads the same set back, so both halves act
  // on exactly the rows belonging to today rather than on whatever happens to
  // carry today's date.
  const intelligenceSet = await getDailySet();

  const cryptoDomain = observerConfigs.crypto;

  const cryptoObservations = await runObserver(cryptoDomain);
  await insertObservations(intelligenceSet, cryptoDomain.domain, cryptoObservations);
  await dumpObservationsForSet(intelligenceSet, cryptoDomain.domain);
  await runTriage(intelligenceSet, cryptoDomain.domain);
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
