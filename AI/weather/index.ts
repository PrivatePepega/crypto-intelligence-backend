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
  // const briefSetId: string | null = "6fdf01b4-cd30-4ef6-b505-55ac9ba4a9b1";

  // const briefSet: DailySet =
  //   briefSetId === null
  //     ? intelligenceSet
  //     : ((await findDailySetById(briefSetId)) ?? intelligenceSet);

  const intelligenceSet = await getDailySet();

  const macro = observerConfigs.macro;
  await runObserver(intelligenceSet, macro);
  await runTriage(intelligenceSet, macro.domain);
  await runResearcher(intelligenceSet, macro.domain);
  await runBriefAnalyst(intelligenceSet, macro);

  const cryptoDomain = observerConfigs.crypto;
  await runObserver(intelligenceSet, cryptoDomain);
  await runTriage(intelligenceSet, cryptoDomain.domain);
  await runResearcher(intelligenceSet, cryptoDomain.domain);
  await runBriefAnalyst(intelligenceSet, cryptoDomain);

  const aiTech = observerConfigs.aiTechnologyIndustry;
  await runObserver(intelligenceSet, aiTech);
  await runTriage(intelligenceSet, aiTech.domain);
  await runResearcher(intelligenceSet, aiTech.domain);
  await runBriefAnalyst(intelligenceSet, aiTech);

  const commoditiesEnergy = observerConfigs.commoditiesEnergy;
  await runObserver(intelligenceSet, commoditiesEnergy);
  await runTriage(intelligenceSet, commoditiesEnergy.domain);
  await runResearcher(intelligenceSet, commoditiesEnergy.domain);
  await runBriefAnalyst(intelligenceSet, commoditiesEnergy);

  const financeMarkets = observerConfigs.financialMarkets;
  await runObserver(intelligenceSet, financeMarkets);
  await runTriage(intelligenceSet, financeMarkets.domain);
  await runResearcher(intelligenceSet, financeMarkets.domain);
  await runBriefAnalyst(intelligenceSet, financeMarkets);

  const geoPolitics = observerConfigs.geopolitics;
  await runObserver(intelligenceSet, geoPolitics);
  await runTriage(intelligenceSet, geoPolitics.domain);
  await runResearcher(intelligenceSet, geoPolitics.domain);
  await runBriefAnalyst(intelligenceSet, geoPolitics);
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
