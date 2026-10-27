import { z } from "zod";

/**
 * U.S. Energy Information Administration (EIA) API v2 schemas and normalized
 * types.
 *
 * Shapes below were observed live on 2026-10-27 against
 * `https://api.eia.gov/v2/`. The provider is permissive in ways that matter:
 *
 *   - `value` is a **string**, not a number ("107.89").
 *   - `response.total` is a **string** ("10276"), not a number.
 *   - A request for an unknown series returns `200` with `total: "0"` and an
 *     empty `data` array. That is a valid empty result, not an error.
 *   - Error bodies are JSON but come in two shapes: `{ error: { code, message } }`
 *     for auth failures and `{ error: "text", code: 400 }` for bad paths.
 *   - `frequency` is an aggregation control, not a filter. Asking for a daily
 *     series at `weekly` returns weekly **aggregates** with HTTP 200. The
 *     collector therefore pins one frequency per series and never varies it.
 */

/** One observation row from `/{route}/data/`. */
export const eiaObservationRowSchema = z.object({
  period: z.string().trim().min(4).max(10),
  /** Provider serializes numbers as strings. */
  value: z.union([z.string(), z.number(), z.null()]).optional(),
  units: z.string().nullable().optional(),
  series: z.string().trim().min(1).max(80),
  "series-description": z.string().nullable().optional(),
  "area-name": z.string().nullable().optional(),
  "product-name": z.string().nullable().optional(),
  "process-name": z.string().nullable().optional(),
  duoarea: z.string().nullable().optional(),
});

export type EiaObservationRow = z.infer<typeof eiaObservationRowSchema>;

/** `response` node of a data query. */
export const eiaDataResponseSchema = z.object({
  total: z.union([z.string(), z.number()]).optional(),
  frequency: z.string().optional(),
  dateFormat: z.string().optional(),
  data: z.array(z.unknown()),
});

export const eiaEnvelopeSchema = z.object({
  warnings: z
    .array(
      z.object({
        warning: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  response: eiaDataResponseSchema,
});

export type EiaEnvelope = z.infer<typeof eiaEnvelopeSchema>;

// --------------------------------------------------
// Normalized internal types
// --------------------------------------------------

export type EiaFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

/** A verified series this collector is allowed to collect. */
export interface EiaSeriesDefinition {
  /** Provider series id, e.g. `RWTC`. Never invented. */
  series_id: string;
  /** Provider route below `/v2/`, e.g. `petroleum/pri/spt`. */
  route: string;
  /** Native cadence. Pinned; never varied per request. */
  frequency: EiaFrequency;
  /** Provider unit token, e.g. `$/BBL`. */
  unit: string;
  /** Provider series description, verified from a live response. */
  title: string;
  /** What the number measures. */
  category:
    | "crude_price_spot"
    | "crude_inventory"
    | "crude_production"
    | "crude_imports"
    | "crude_exports"
    | "refinery_utilization"
    | "product_supplied"
    | "gas_storage"
    | "gas_production"
    | "gas_consumption";
  /** Whether the series is a price observation or a fundamental statistic. */
  kind: "price" | "fundamental";
  /** Benchmark asset this series is stored against, when it is a price. */
  asset_symbol: string | null;
}

/** A single verified scalar observation. */
export interface EiaObservation {
  provider: "eia";
  series_id: string;
  frequency: EiaFrequency;
  /** Provider period exactly as reported. */
  period: string;
  value: number;
  unit: string;
  series_name: string | null;
  /** ISO time the collector fetched this period. */
  collected_at: string;
}

export interface EiaRejection {
  period: string | null;
  reason: string;
}

export interface EiaSeriesResult {
  provider: "eia";
  definition: EiaSeriesDefinition;
  fetched_at: string;
  requested: {
    start: string | null;
    end: string | null;
    limit: number;
  };
  /** Provider-reported total matching rows, parsed from a string. */
  provider_total: number | null;
  /** Rows the provider says exist but that were not returned in this run. */
  truncated: boolean;
  /** Provider warnings, surfaced verbatim. */
  warnings: string[];
  observations: EiaObservation[];
  rejected: EiaRejection[];
  duplicates_removed: number;
  provider_frequency: string | null;
}

/** Guarded identity used for the `assets.assets` upsert. */
export interface EnergyAssetInput {
  symbol: string;
  name: string;
  commodity_type: string | null;
  benchmark: string | null;
  currency: string | null;
  unit_of_measure: string | null;
  value_drivers: Record<string, unknown> | null;
  provider_series: string;
  provider_route: string;
  provider_frequency: EiaFrequency;
  provider_unit: string;
  provider_title: string;
}

/** Latest-observation snapshot written to `assets.information`. */
export interface EnergySnapshotInput {
  /** NULL when the observation is market-wide context, not an asset property. */
  asset_id: string | null;
  information_type: "market_snapshot" | "macro_context";
  definition: EiaSeriesDefinition;
  observation: EiaObservation;
  source_url: string;
}
