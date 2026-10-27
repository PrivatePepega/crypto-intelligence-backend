import {
  eiaObservationRowSchema,
  type EiaObservation,
  type EiaRejection,
  type EiaSeriesDefinition,
  type EiaSeriesResult,
} from "../../../types/EIA/eia.types.js";
import { readEiaWarnings } from "./eiaClient.js";

/**
 * Pure normalization for EIA API v2 data responses.
 *
 * What this module refuses to do is as important as what it does:
 *
 *   - No unit conversion. Units are pinned per series and compared verbatim.
 *   - No frequency coercion. The period must match the pinned cadence, so a
 *     daily series can never quietly become a weekly aggregate.
 *   - No zero-filling. A missing or unparseable value rejects the row instead of
 *     storing `0`.
 *   - No invented timestamps. EIA reports a period, not an instant, so
 *     `observed_at` stays NULL and the period is the recorded time.
 *   - No cross-series mixing. A row belonging to another series is rejected.
 */

const PERIOD_PATTERNS: Record<EiaSeriesDefinition["frequency"], RegExp> = {
  daily: /^\d{4}-\d{2}-\d{2}$/,
  weekly: /^\d{4}-\d{2}-\d{2}$/,
  monthly: /^\d{4}-\d{2}$/,
  quarterly: /^\d{4}-Q[1-4]$/,
  annual: /^\d{4}$/,
};

/** Validates that a period string is real and matches the series cadence. */
export function isValidPeriod(
  period: string,
  frequency: EiaSeriesDefinition["frequency"],
): boolean {
  if (!PERIOD_PATTERNS[frequency].test(period)) {
    return false;
  }

  if (frequency === "annual") {
    const year = Number(period);
    return year >= 1900 && year <= 2200;
  }

  if (frequency === "quarterly") {
    const year = Number(period.slice(0, 4));
    return year >= 1900 && year <= 2200;
  }

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  if (year < 1900 || year > 2200 || month < 1 || month > 12) {
    return false;
  }

  if (frequency === "monthly") {
    return true;
  }

  const day = Number(period.slice(8, 10));
  if (day < 1 || day > 31) {
    return false;
  }

  // Rejects impossible calendar days such as 2026-02-30.
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Parses a provider value.
 *
 * EIA serializes numbers as strings. `null`, `""`, `"NA"` and non-finite text
 * are unusable, and unusable means "reject the row", never `0`.
 */
export function parseEiaValue(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "NA" || trimmed === "N/A" || trimmed === "--") {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parses `response.total`, which EIA returns as a string. */
export function parseProviderTotal(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw !== "string") {
    return null;
  }
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface NormalizeSeriesInput {
  definition: EiaSeriesDefinition;
  fetchedAt: string;
  requested: { start: string | null; end: string | null; limit: number };
  /** Whether the provider signalled a truncated result. */
  truncated: boolean;
}

/**
 * Normalizes one or more pages of a single EIA series.
 *
 * Accepts either a full envelope (`{ response: { data } }`) or a bare array of
 * rows, so paging can accumulate rows before normalization.
 */
export function normalizeEiaSeries(raw: unknown, input: NormalizeSeriesInput): EiaSeriesResult {
  const { definition } = input;

  const result: EiaSeriesResult = {
    provider: "eia",
    definition,
    fetched_at: input.fetchedAt,
    requested: input.requested,
    provider_total: null,
    truncated: input.truncated,
    warnings: readEiaWarnings(raw),
    observations: [],
    rejected: [],
    duplicates_removed: 0,
    provider_frequency: null,
  };

  let rows: unknown[];
  if (Array.isArray(raw)) {
    rows = raw;
  } else if (isRecord(raw) && isRecord(raw["response"])) {
    const response = raw["response"] as Record<string, unknown>;
    result.provider_total = parseProviderTotal(response["total"]);
    result.provider_frequency =
      typeof response["frequency"] === "string" ? response["frequency"] : null;
    const data = response["data"];
    rows = Array.isArray(data) ? data : [];
    if (!Array.isArray(data)) {
      result.rejected.push({ period: null, reason: "response.data was not an array" });
      return result;
    }
  } else {
    result.rejected.push({ period: null, reason: "response was not an EIA envelope" });
    return result;
  }

  const byPeriod = new Map<string, EiaObservation>();

  for (const row of rows) {
    const parsed = eiaObservationRowSchema.safeParse(row);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const periodGuess =
        isRecord(row) && typeof row["period"] === "string" ? row["period"].slice(0, 20) : null;
      result.rejected.push({
        period: periodGuess,
        reason: `row failed validation${issue ? `: ${issue.path.join(".")} ${issue.message}` : ""}`,
      });
      continue;
    }

    const data = parsed.data;

    if (data.series.trim() !== definition.series_id) {
      result.rejected.push({
        period: data.period,
        reason: `row belongs to series ${data.series.trim()}, expected ${definition.series_id}`,
      });
      continue;
    }

    if (!isValidPeriod(data.period, definition.frequency)) {
      result.rejected.push({
        period: data.period,
        reason: `period does not match the pinned ${definition.frequency} cadence`,
      });
      continue;
    }

    // Unit is pinned. A mismatch means the series no longer measures what the
    // catalog says it measures, so the row is rejected rather than converted.
    const providerUnit = typeof data.units === "string" ? data.units.trim() : null;
    if (providerUnit !== null && providerUnit !== definition.unit) {
      result.rejected.push({
        period: data.period,
        reason: `unit ${providerUnit} does not match pinned unit ${definition.unit}`,
      });
      continue;
    }

    const value = parseEiaValue(data.value);
    if (value === null) {
      result.rejected.push({
        period: data.period,
        reason: "no usable numeric value",
      });
      continue;
    }

    const observation: EiaObservation = {
      provider: "eia",
      series_id: definition.series_id,
      frequency: definition.frequency,
      period: data.period,
      value,
      // The catalog unit is authoritative; the row-level unit was verified above.
      unit: definition.unit,
      series_name: data["series-description"]?.trim() ?? definition.title,
      collected_at: input.fetchedAt,
    };

    if (byPeriod.has(observation.period)) {
      result.duplicates_removed += 1;
    }
    byPeriod.set(observation.period, observation);
  }

  result.observations = [...byPeriod.values()].sort((left, right) =>
    left.period.localeCompare(right.period),
  );

  return result;
}

/** Merges several already-normalized pages of the same series. */
export function mergeSeriesResults(
  results: EiaSeriesResult[],
  input: {
    definition: EiaSeriesDefinition;
    fetchedAt: string;
    requested: EiaSeriesResult["requested"];
  },
): EiaSeriesResult {
  const merged: EiaSeriesResult = {
    provider: "eia",
    definition: input.definition,
    fetched_at: input.fetchedAt,
    requested: input.requested,
    provider_total: null,
    truncated: false,
    warnings: [],
    observations: [],
    rejected: [],
    duplicates_removed: 0,
    provider_frequency: null,
  };

  const byPeriod = new Map<string, EiaObservation>();

  for (const result of results) {
    merged.rejected.push(...result.rejected);
    merged.duplicates_removed += result.duplicates_removed;
    merged.truncated = merged.truncated || result.truncated;
    merged.warnings.push(...result.warnings);
    // Every page reports the same overall `total`, so the widest value wins.
    merged.provider_total =
      result.provider_total === null
        ? merged.provider_total
        : Math.max(merged.provider_total ?? 0, result.provider_total);
    merged.provider_frequency = result.provider_frequency ?? merged.provider_frequency;

    for (const observation of result.observations) {
      if (byPeriod.has(observation.period)) {
        merged.duplicates_removed += 1;
      }
      byPeriod.set(observation.period, observation);
    }
  }

  merged.observations = [...byPeriod.values()].sort((left, right) =>
    left.period.localeCompare(right.period),
  );

  return merged;
}

/**
 * Stable identity for a stored observation.
 *
 * Mirrors the database unique key: a provider cannot report two different values
 * for the same series, frequency and period.
 */
export function buildObservationKey(observation: EiaObservation): string {
  return `${observation.provider}:${observation.series_id}:${observation.frequency}:${observation.period}`;
}

/**
 * Builds the `assets.information.data` payload for the latest observation.
 *
 * Prices are `market_snapshot`; supply/demand statistics are `macro_context`.
 */
export function buildObservationSnapshotData(
  definition: EiaSeriesDefinition,
  observation: EiaObservation,
): Record<string, unknown> {
  return {
    provider: "eia",
    source: "eia",
    series_id: definition.series_id,
    series_name: observation.series_name ?? definition.title,
    route: definition.route,
    category: definition.category,
    kind: definition.kind,
    frequency: definition.frequency,
    period: observation.period,
    value: observation.value,
    unit: observation.unit,
    snapshot_key: `${buildObservationKey(observation)}:latest`,
    observed_at: null,
    collected_at: observation.collected_at,
    limitations: [
      "Provider-reported observation; not independently verified.",
      "EIA reports a period, not an observation instant, so observed_at is null.",
      "A scalar observation is not an OHLC candle.",
    ],
  };
}

/** Snapshot type implied by the meaning of the series. */
export function snapshotTypeFor(
  definition: EiaSeriesDefinition,
): "market_snapshot" | "macro_context" {
  return definition.kind === "price" ? "market_snapshot" : "macro_context";
}

export type { EiaRejection };
