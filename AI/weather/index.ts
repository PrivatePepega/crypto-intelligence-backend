import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../config/database.js";

import { observerConfigs } from "./weather.config.js";
import { runObserver } from "./observer/observer.js";

import { findDailySetById, getDailySet, type DailySet } from "../utils/weather/observations.js";
import { runTriage } from "./triage/triage.js";
import { runResearcher } from "./researcher/researcher.js";


import { runBriefAnalyst } from "./briefAnalyst/briefAnalyst.js";


export async function runWeather(): Promise<void> {
  const intelligenceSet = await getDailySet();

  const cryptoDomain = observerConfigs.crypto;

  // await runObserver(intelligenceSet, cryptoDomain);
  // await runTriage(intelligenceSet, cryptoDomain.domain);
  // await runResearcher(intelligenceSet, cryptoDomain.domain);

  const briefSetId: string | null = "6fdf01b4-cd30-4ef6-b505-55ac9ba4a9b1";

  const briefSet: DailySet =
    briefSetId === null
      ? intelligenceSet
      : ((await findDailySetById(briefSetId)) ?? intelligenceSet);

  await runBriefAnalyst(briefSet, cryptoDomain)
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
