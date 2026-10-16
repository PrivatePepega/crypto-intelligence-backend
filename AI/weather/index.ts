import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../config/database.js";

import { observerConfigs, type ObserverConfig } from "./weather.config.js";
import { runObserver } from "./observer/observer.js";

import { getDailySet, type DailySet } from "../utils/weather/observations.js";
import { runTriage } from "./triage/triage.js";
import { runResearcher } from "./researcher/researcher.js";

import { runBriefAnalyst } from "./briefAnalyst/briefAnalyst.js";

// Uncommented alongside the clear helpers below. Each is a hard DELETE, so importing
// them alone changes nothing - but leaving them out of the file means the clear path
// is retyped from scratch the next time it is needed.
// import { deleteObservationsForSet } from "../utils/weather/dbFetcher.observer.js";
// import { resetResearchFlagsForSet } from "../utils/weather/dbFetcher.triage.js";
// import { deleteResearchForSet } from "../utils/weather/dbFetcher.researcher.js";
// import { deleteBriefsForSet } from "../utils/weather/dbFetcher.brief.js";

/** Every domain the pipeline runs, in order. */
const DOMAINS = [
  observerConfigs.geopolitics,
  observerConfigs.financialMarkets,
  observerConfigs.macro,
  observerConfigs.commoditiesEnergy,
  observerConfigs.crypto,
  observerConfigs.aiTechnologyIndustry,
];






/**
 * Runs one domain through all four stages.
 *
 * ## Why a whole domain is skipped rather than one stage
 *
 * Each stage depends on the one before it. An Observer that returns nothing leaves
 * Triage nothing to label, which leaves Research nothing to investigate, which leaves
 * the Brief Analyst nothing to summarise. Continuing after a failed stage does not
 * produce a partial domain - it produces a domain that looks complete and is not,
 * which is what happened when the 503 let the crypto observer through as a clean run
 * with zero observations.
 *
 * So a domain either completes or is abandoned, and the next domain starts. The
 * stages that already succeeded have written their rows and stay: re-running the
 * domain later is the point, and the queue excludes what has been done.
 *
 * Retries happen inside the agents - see `AI/utils/weather/retry.ts`. By the time an
 * error reaches here, every model call for that stage has already failed five times
 * across about a minute.
 *
 * @returns `true` when all four stages completed.
 */
const runDomain = async (intelligenceSet: DailySet, config: ObserverConfig): Promise<boolean> => {
  const domain = config.domain;

  try {
    await runObserver(intelligenceSet, config);

    await runTriage(intelligenceSet, domain);

    await runResearcher(intelligenceSet, domain);

    await runBriefAnalyst(intelligenceSet, config);

    console.log(`\n${"=".repeat(72)}\n[weather] ${domain} COMPLETE\n${"=".repeat(72)}\n`);

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // Loud on purpose. This is the one line that has to be impossible to scroll past:
    // the domain is being abandoned and its remaining stages are not going to run, so
    // whatever comes next in the output is a different domain.
    console.error(
      `\n${"#".repeat(72)}\n` +
        `[weather] DOMAIN FAILED - ${domain}\n` +
        `         ${message}\n` +
        `         skipping the remaining stages for ${domain}; its run log holds the detail\n` +
        `         re-run this domain later to pick up where it stopped\n` +
        `${"#".repeat(72)}\n`,
    );

    if (stack !== undefined) {
      console.error(stack);
    }

    return false;
  }
};

/**
 * Runs the whole weather pipeline.
 *
 * Every domain is attempted even when an earlier one failed, because the domains are
 * independent and a single provider outage should not cost the other five their day.
 * The process still exits non-zero if any domain was abandoned, so a partial run is
 * never mistaken for a complete one.
 */
export async function runWeather(): Promise<void> {
  const intelligenceSet = await getDailySet();

  const failed: string[] = [];

  for (const config of DOMAINS) {
    const completed = await runDomain(intelligenceSet, config);

    if (!completed) {
      failed.push(config.domain);
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(
    `[weather] pipeline finished - ${DOMAINS.length - failed.length}/${DOMAINS.length} domains complete`,
  );

  if (failed.length > 0) {
    console.error(`[weather] FAILED DOMAINS: ${failed.join(", ")}`);
    console.error(`[weather] re-run these before treating the set as analysed.`);

    process.exitCode = 1;

    return;
  }

  console.log(`[weather] all domains complete.`);
  console.log(`${"=".repeat(72)}\n`);
}

/**
 * Deletes everything one intelligence set produced, in foreign-key-safe order.
 *
 * ## Why the order is not arbitrary
 *
 * `weather.research.observation_id` is `ON DELETE RESTRICT`, so deleting an
 * observation that still has research fails outright rather than cascading. Research
 * therefore has to go first. Briefs go first of all because they reference the daily
 * set itself and depend on nothing else.
 *
 * ## Why this is commented out
 *
 * It is a DELETE with no confirmation and no dry run. Left in the file, commented, so
 * the ordering is written down where someone clearing a set will find it - and so it
 * cannot be reached by a stray import.
 *
 * Uncomment the imports at the top of this file and the call below, then re-comment.
 */
// export const clearIntelligenceSet = async (intelligenceSet: DailySet): Promise<void> => {
//   const briefs = await deleteBriefsForSet(intelligenceSet);
//   const research = await deleteResearchForSet(intelligenceSet);
//   const observations = await deleteObservationsForSet(intelligenceSet);
//   const promoted = await resetResearchFlagsForSet(intelligenceSet);
// };

const isDirectRun =
  process.argv[1] !== undefined &&
  process.argv[0] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runWeather()
    .catch((error) => {
      console.error("Weather run failed:", error);

      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
