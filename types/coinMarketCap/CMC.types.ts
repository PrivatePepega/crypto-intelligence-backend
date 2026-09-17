import { z } from "zod";

const altcoinSeasonPointSchema = z.object({
  timestamp: z.string(),
  altcoin_index: z.number(),
  altcoin_marketcap: z.number(),
});

export const coinMarketCapAltcoinSeasonLatestSchema = z.object({
  data: z.object({
    altcoin_index: z.number(),
    altcoin_marketcap: z.number(),
    snapshot_time: z.string(),
    yearly_high: z.number(),
    yearly_high_date: z.string(),
    yearly_low: z.number(),
    yearly_low_date: z.string(),
  }),

  status: z.object({
    timestamp: z.string(),
    error_code: z.number(),
    error_message: z.string().nullable(),
    elapsed: z.number(),
    credit_count: z.number(),
    notice: z.string().nullable(),
  }),
});

export const coinMarketCapAltcoinSeasonHistoricalSchema = z.object({
  data: z.object({
    timeframe: z.string(),
    points: z.array(altcoinSeasonPointSchema),
  }),

  status: z.object({
    timestamp: z.string(),
    error_code: z.number(),
    error_message: z.string().nullable(),
    elapsed: z.number(),
    credit_count: z.number(),
    notice: z.string().nullable(),
  }),
});

export type CoinMarketCapAltcoinSeasonLatest = z.infer<
  typeof coinMarketCapAltcoinSeasonLatestSchema
>;

export type CoinMarketCapAltcoinSeasonHistorical = z.infer<
  typeof coinMarketCapAltcoinSeasonHistoricalSchema
>;