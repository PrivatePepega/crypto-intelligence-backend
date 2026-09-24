import { z } from "zod";

export const FredSeriesSchema = z.object({
  id: z.string(),
  realtime_start: z.string(),
  realtime_end: z.string(),
  title: z.string(),
  observation_start: z.string(),
  observation_end: z.string(),
  frequency: z.string(),
  frequency_short: z.string(),
  units: z.string(),
  units_short: z.string(),
  seasonal_adjustment: z.string(),
  seasonal_adjustment_short: z.string(),
  last_updated: z.string(),
  popularity: z.number(),
  notes: z.string(),
});

export const FredObservationSchema = z.object({
  realtime_start: z.string(),
  realtime_end: z.string(),
  date: z.string(),
  value: z.string().nullable(),
});

export const FredObservationsResponseSchema = z.object({
  realtime_start: z.string(),
  realtime_end: z.string(),
  observation_start: z.string(),
  observation_end: z.string(),
  units: z.string(),
  output_type: z.number(),
  file_type: z.string(),
  order_by: z.string(),
  sort_order: z.string(),
  count: z.number(),
  offset: z.number(),
  limit: z.number(),
  observations: z.array(FredObservationSchema),
});

export const FredSeriesResponseSchema = z.object({
  seriess: z.array(FredSeriesSchema),
});

export type FredSeriesResponse = z.infer<
  typeof FredSeriesResponseSchema
>;

export type FredObservationsResponse = z.infer<
  typeof FredObservationsResponseSchema
>;

export interface NormalizedIndicatorObservation {
  date: string;
  value: number | null;
}

export interface NormalizedIndicatorData {
  indicator: string;
  seriesId: string;
  frequency: string;
  aggregation: string;
  unit: string;
  observations: NormalizedIndicatorObservation[];
  historical: {
    date: string;
    value: number | null;
  } | null;
  series: FredSeriesResponse["seriess"][number];
}