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




const coinMarketCapGlobalMetricsUsdSchema = z.object({
  total_market_cap: z.number(),
  total_volume_24h: z.number(),
  total_volume_24h_reported: z.number(),

  altcoin_volume_24h: z.number(),
  altcoin_volume_24h_reported: z.number(),
  altcoin_market_cap: z.number(),

  defi_volume_24h: z.number(),
  defi_volume_24h_reported: z.number(),
  defi_market_cap: z.number(),
  defi_24h_percentage_change: z.number(),

  stablecoin_volume_24h: z.number(),
  stablecoin_volume_24h_reported: z.number(),
  stablecoin_market_cap: z.number(),
  stablecoin_24h_percentage_change: z.number(),

  derivatives_volume_24h: z.number(),
  derivatives_volume_24h_reported: z.number(),
  derivatives_24h_percentage_change: z.number(),

  total_market_cap_yesterday: z.number(),
  total_volume_24h_yesterday: z.number(),
  total_market_cap_yesterday_percentage_change: z.number(),
  total_volume_24h_yesterday_percentage_change: z.number(),

  last_updated: z.string(),
});

const coinMarketCapGlobalMetricsStatusSchema = z.object({
  timestamp: z.string(),
  error_code: z.number(),
  error_message: z.string().nullable(),
  elapsed: z.number(),
  credit_count: z.number(),
  notice: z.string().nullable(),
});

export const coinMarketCapGlobalMetricsSchema = z.object({
  data: z.object({
    quote: z.object({
      USD: coinMarketCapGlobalMetricsUsdSchema,
    }),

    btc_dominance: z.number(),
    eth_dominance: z.number(),

    active_cryptocurrencies: z.number(),
    total_cryptocurrencies: z.number(),
    active_market_pairs: z.number(),
    active_exchanges: z.number(),
    total_exchanges: z.number(),

    last_updated: z.string(),

    eth_dominance_yesterday: z.number(),
    btc_dominance_yesterday: z.number(),

    eth_dominance_24h_percentage_change: z.number(),
    btc_dominance_24h_percentage_change: z.number(),

    defi_volume_24h: z.number(),
    defi_volume_24h_reported: z.number(),
    defi_market_cap: z.number(),
    defi_24h_percentage_change: z.number(),

    stablecoin_volume_24h: z.number(),
    stablecoin_volume_24h_reported: z.number(),
    stablecoin_market_cap: z.number(),
    stablecoin_24h_percentage_change: z.number(),

    derivatives_volume_24h: z.number(),
    derivatives_volume_24h_reported: z.number(),
    derivatives_24h_percentage_change: z.number(),

    total_crypto_dex_currencies: z.number(),
    today_incremental_crypto_number: z.number(),
    past_24h_incremental_crypto_number: z.number(),
    past_7d_incremental_crypto_number: z.number(),
    past_30d_incremental_crypto_number: z.number(),

    today_change_percent: z.number(),

    tracked_yearly_number: z.object({
      maxIncrementalNumber: z.number(),
      minIncrementalNumber: z.number(),
      maxIncrementalDate: z.string(),
      minIncrementalDate: z.string(),
    }),
  }),

  status: coinMarketCapGlobalMetricsStatusSchema,
});

export type CoinMarketCapGlobalMetrics = z.infer<
  typeof coinMarketCapGlobalMetricsSchema
>;