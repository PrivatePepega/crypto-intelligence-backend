import type { AgentRunLog } from "../logger.js";
import { createAgentRunLog, createSilentAgentRunLog } from "../logger.js";

import { dumpObservationsForSet } from "./dbFetcher.observer.js";
import {
  getDailySet,
  insertObservations,
  type DailySet,
  type Observation,
} from "./observations.js";

// --------------------------------------------------
// Observer artifacts
// --------------------------------------------------
//
// Everything the Observer writes into AI/data/, in one place.
//
// The database writes are the product and are not here: observations go into
// weather.observations regardless of this switch. What this module controls is
// the JSON on disk - the run log and the observations snapshot - which exists to
// be read while building the pipeline and is dead weight in production.
//
// One switch per agent. See OBSERVER_ARTIFACTS.
// --------------------------------------------------

/** This agent's name. Names the run-log folder and file. */
export const AGENT_NAME = "Weather Observer";

/**
 * Whether the Observer keeps its JSON artifacts.
 *
 * Set this to `false` and the Observer stops writing to AI/data entirely: no run
 * log under `Weather Observer/`, no snapshot under
 * `database Fetcher/observations/`. Its observations still reach
 * weather.observations, and its console lines still print, because neither is a
 * file artifact.
 *
 * Comment the line out to disable it.
 *
 * Left `true` because these files are the only record of what the Observer
 * actually did: its reasoning, its per-step tool calls and its raw formatter
 * response. A pipeline that cannot explain a bad day is hard to fix.
 */
export const OBSERVER_ARTIFACTS = true;

/**
 * The Observer's run log, or a no-op stand-in when artifacts are off.
 *
 * Deliberately returns the same type either way, so no agent code changes shape
 * when the switch flips.
 */
export const createObserverRunLog = async (marketDomain: string): Promise<AgentRunLog> => {
  return OBSERVER_ARTIFACTS
    ? await createAgentRunLog(AGENT_NAME, marketDomain)
    : createSilentAgentRunLog(AGENT_NAME, marketDomain);
};

/**
 * Snapshots the set's observations to
 * `AI/data/database Fetcher/observations/observations-<date>-<domain>.json`.
 *
 * A no-op returning `null` when artifacts are off, so the caller can report the
 * real path or report that there is none rather than printing an empty string.
 *
 * Reads the rows back from the set rather than reusing the observations handed in,
 * so the snapshot records what actually committed rather than what was passed in.
 */
export const writeObservationsSnapshot = async (
  intelligenceSet: DailySet,
  marketDomain: string,
): Promise<string | null> => {
  if (!OBSERVER_ARTIFACTS) return null;

  return await dumpObservationsForSet(intelligenceSet, marketDomain);
};

/**
 * Files the Observer's observations under a daily set, then snapshots them.
 *
 * The two database-facing steps the Observer owns, collapsed so a caller runs the
 * Observer with one call rather than remembering both. Read back from the set
 * rather than reusing the in-memory list, so what the snapshot shows is what the
 * database holds.
 *
 * @returns How many rows were written, and the snapshot path (`null` when
 * artifacts are off).
 */
export const persistObservations = async (
  intelligenceSet: DailySet,
  marketDomain: string,
  observations: Observation[],
): Promise<{ inserted: number; snapshotFile: string | null }> => {
  const inserted = await insertObservations(intelligenceSet, marketDomain, observations);

  const snapshotFile = await writeObservationsSnapshot(intelligenceSet, marketDomain);

  return { inserted, snapshotFile };
};

// Re-exported so a caller persisting the Observer's work needs one import rather
// than reaching for `getDailySet` directly.
export { getDailySet };
