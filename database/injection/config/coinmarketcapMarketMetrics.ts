// Metric contract for the CoinMarketCap crypto market metrics indicator.
//
// This drives the column list for the current table, so it is kept next to the
// other shared injection contracts rather than inside the injector. All 17
// metrics carry the same six columns: current, previous day, net change,
// percent change, 30-day moving average, and the difference from that average.

export type CmcMarketMetricsObservation = {
  date: string;

  totalMarketCap: number;
  totalVolume24h: number;

  altcoinMarketCap: number;
  altcoinVolume24h: number;

  btcDominance: number;
  ethDominance: number;

  defiMarketCap: number;
  defiVolume24h: number;
  defi24hPercentageChange: number;

  stablecoinMarketCap: number;
  stablecoinVolume24h: number;
  stablecoin24hPercentageChange: number;

  derivativesVolume24h: number;
  derivatives24hPercentageChange: number;

  totalMarketCapYesterday: number;
  totalVolume24hYesterday: number;

  totalMarketCapYesterdayPercentageChange: number;
  totalVolume24hYesterdayPercentageChange: number;

  activeCryptocurrencies: number;
  activeMarketPairs: number;
  activeExchanges: number;
};

export type CmcMarketMetricsKey = keyof CmcMarketMetricsObservation;

export type CmcMarketMetricsMetric = {
  key: Exclude<
    CmcMarketMetricsKey,
    | "date"
    | "totalMarketCapYesterday"
    | "totalVolume24hYesterday"
    | "totalMarketCapYesterdayPercentageChange"
    | "totalVolume24hYesterdayPercentageChange"
  >;
  // Column in historical.coinmarketcap_general_crypto_metric.
  historicalColumn: string;
  currentColumn: string;
  previousColumn: string;
  netChangeColumn: string;
  percentChangeColumn: string;
  movingAverageColumn: string;
  currentVsMovingAverageColumn: string;
};

// Matches the table name in current.coinmarketcap_general_crypto_metric.
export const CMC_MARKET_METRICS_INDICATOR =
  "coinmarketcap_general_crypto_metric";

// Must match seriesId in database/injection/indicators/
// coinmarketcapcryptomarketmetrics.ts, which is the FK target. Note this is
// "crypto_market_metrics", not the table name.
export const CMC_MARKET_METRICS_SERIES_ID = "coinmarketcap_crypto_market_metrics";

// The current observation is folded into the average, so 29 prior days are
// needed for a 30-day window.
export const CMC_MARKET_METRICS_MA_PERIOD = 30;

export const CMC_MARKET_METRICS: CmcMarketMetricsMetric[] = [
  {
    key: "totalMarketCap",
    historicalColumn: "total_market_cap",
    currentColumn: "current_total_market_cap",
    previousColumn: "previous_day_total_market_cap",
    netChangeColumn: "total_market_cap_net_change",
    percentChangeColumn: "total_market_cap_percent_change",
    movingAverageColumn: "moving_average_30d_total_market_cap",
    currentVsMovingAverageColumn: "current_vs_30d_ma_total_market_cap",
  },
  {
    key: "totalVolume24h",
    historicalColumn: "total_volume_24h",
    currentColumn: "current_total_volume_24h",
    previousColumn: "previous_day_total_volume_24h",
    netChangeColumn: "total_volume_24h_net_change",
    percentChangeColumn: "total_volume_24h_percent_change",
    movingAverageColumn: "moving_average_30d_total_volume_24h",
    currentVsMovingAverageColumn: "current_vs_30d_ma_total_volume_24h",
  },
  {
    key: "altcoinMarketCap",
    historicalColumn: "altcoin_market_cap",
    currentColumn: "current_altcoin_market_cap",
    previousColumn: "previous_day_altcoin_market_cap",
    netChangeColumn: "altcoin_market_cap_net_change",
    percentChangeColumn: "altcoin_market_cap_percent_change",
    movingAverageColumn: "moving_average_30d_altcoin_market_cap",
    currentVsMovingAverageColumn: "current_vs_30d_ma_altcoin_market_cap",
  },
  {
    key: "altcoinVolume24h",
    historicalColumn: "altcoin_volume_24h",
    currentColumn: "current_altcoin_volume_24h",
    previousColumn: "previous_day_altcoin_volume_24h",
    netChangeColumn: "altcoin_volume_24h_net_change",
    percentChangeColumn: "altcoin_volume_24h_percent_change",
    movingAverageColumn: "moving_average_30d_altcoin_volume_24h",
    currentVsMovingAverageColumn: "current_vs_30d_ma_altcoin_volume_24h",
  },
  {
    key: "btcDominance",
    historicalColumn: "btc_dominance",
    currentColumn: "current_btc_dominance",
    previousColumn: "previous_day_btc_dominance",
    netChangeColumn: "btc_dominance_net_change",
    percentChangeColumn: "btc_dominance_percent_change",
    movingAverageColumn: "moving_average_30d_btc_dominance",
    currentVsMovingAverageColumn: "current_vs_30d_ma_btc_dominance",
  },
  {
    key: "ethDominance",
    historicalColumn: "eth_dominance",
    currentColumn: "current_eth_dominance",
    previousColumn: "previous_day_eth_dominance",
    netChangeColumn: "eth_dominance_net_change",
    percentChangeColumn: "eth_dominance_percent_change",
    movingAverageColumn: "moving_average_30d_eth_dominance",
    currentVsMovingAverageColumn: "current_vs_30d_ma_eth_dominance",
  },
  {
    key: "defiMarketCap",
    historicalColumn: "defi_market_cap",
    currentColumn: "current_defi_market_cap",
    previousColumn: "previous_day_defi_market_cap",
    netChangeColumn: "defi_market_cap_net_change",
    percentChangeColumn: "defi_market_cap_percent_change",
    movingAverageColumn: "moving_average_30d_defi_market_cap",
    currentVsMovingAverageColumn: "current_vs_30d_ma_defi_market_cap",
  },
  {
    key: "defiVolume24h",
    historicalColumn: "defi_volume_24h",
    currentColumn: "current_defi_volume_24h",
    previousColumn: "previous_day_defi_volume_24h",
    netChangeColumn: "defi_volume_24h_net_change",
    percentChangeColumn: "defi_volume_24h_percent_change",
    movingAverageColumn: "moving_average_30d_defi_volume_24h",
    currentVsMovingAverageColumn: "current_vs_30d_ma_defi_volume_24h",
  },
  {
    key: "defi24hPercentageChange",
    historicalColumn: "defi_24h_percentage_change",
    currentColumn: "current_defi_24h_percentage_change",
    previousColumn: "previous_day_defi_24h_percentage_change",
    netChangeColumn: "defi_24h_percentage_change_net_change",
    percentChangeColumn: "defi_24h_percentage_change_percent_change",
    movingAverageColumn: "moving_average_30d_defi_24h_percentage_change",
    currentVsMovingAverageColumn:
      "current_vs_30d_ma_defi_24h_percentage_change",
  },
  {
    key: "stablecoinMarketCap",
    historicalColumn: "stablecoin_market_cap",
    currentColumn: "current_stablecoin_market_cap",
    previousColumn: "previous_day_stablecoin_market_cap",
    netChangeColumn: "stablecoin_market_cap_net_change",
    percentChangeColumn: "stablecoin_market_cap_percent_change",
    movingAverageColumn: "moving_average_30d_stablecoin_market_cap",
    currentVsMovingAverageColumn:
      "current_vs_30d_ma_stablecoin_market_cap",
  },
  {
    key: "stablecoinVolume24h",
    historicalColumn: "stablecoin_volume_24h",
    currentColumn: "current_stablecoin_volume_24h",
    previousColumn: "previous_day_stablecoin_volume_24h",
    netChangeColumn: "stablecoin_volume_24h_net_change",
    percentChangeColumn: "stablecoin_volume_24h_percent_change",
    movingAverageColumn: "moving_average_30d_stablecoin_volume_24h",
    currentVsMovingAverageColumn:
      "current_vs_30d_ma_stablecoin_volume_24h",
  },
  {
    key: "stablecoin24hPercentageChange",
    historicalColumn: "stablecoin_24h_percentage_change",
    currentColumn: "current_stablecoin_24h_percentage_change",
    previousColumn: "previous_day_stablecoin_24h_percentage_change",
    netChangeColumn: "stablecoin_24h_percentage_change_net_change",
    percentChangeColumn: "stablecoin_24h_percentage_change_percent_change",
    movingAverageColumn:
      "moving_average_30d_stablecoin_24h_percentage_change",
    currentVsMovingAverageColumn:
      "current_vs_30d_ma_stablecoin_24h_percentage_change",
  },
  {
    key: "derivativesVolume24h",
    historicalColumn: "derivatives_volume_24h",
    currentColumn: "current_derivatives_volume_24h",
    previousColumn: "previous_day_derivatives_volume_24h",
    netChangeColumn: "derivatives_volume_24h_net_change",
    percentChangeColumn: "derivatives_volume_24h_percent_change",
    movingAverageColumn: "moving_average_30d_derivatives_volume_24h",
    currentVsMovingAverageColumn:
      "current_vs_30d_ma_derivatives_volume_24h",
  },
  {
    key: "derivatives24hPercentageChange",
    historicalColumn: "derivatives_24h_percentage_change",
    currentColumn: "current_derivatives_24h_percentage_change",
    previousColumn: "previous_day_derivatives_24h_percentage_change",
    netChangeColumn: "derivatives_24h_percentage_change_net_change",
    percentChangeColumn: "derivatives_24h_percentage_change_percent_change",
    movingAverageColumn:
      "moving_average_30d_derivatives_24h_percentage_change",
    currentVsMovingAverageColumn:
      "current_vs_30d_ma_derivatives_24h_percentage_change",
  },
  {
    key: "activeCryptocurrencies",
    historicalColumn: "active_cryptocurrencies",
    currentColumn: "current_active_cryptocurrencies",
    previousColumn: "previous_day_active_cryptocurrencies",
    netChangeColumn: "active_cryptocurrencies_net_change",
    percentChangeColumn: "active_cryptocurrencies_percent_change",
    movingAverageColumn: "moving_average_30d_active_cryptocurrencies",
    currentVsMovingAverageColumn:
      "current_vs_30d_ma_active_cryptocurrencies",
  },
  {
    key: "activeMarketPairs",
    historicalColumn: "active_market_pairs",
    currentColumn: "current_active_market_pairs",
    previousColumn: "previous_day_active_market_pairs",
    netChangeColumn: "active_market_pairs_net_change",
    percentChangeColumn: "active_market_pairs_percent_change",
    movingAverageColumn: "moving_average_30d_active_market_pairs",
    currentVsMovingAverageColumn:
      "current_vs_30d_ma_active_market_pairs",
  },
  {
    key: "activeExchanges",
    historicalColumn: "active_exchanges",
    currentColumn: "current_active_exchanges",
    previousColumn: "previous_day_active_exchanges",
    netChangeColumn: "active_exchanges_net_change",
    percentChangeColumn: "active_exchanges_percent_change",
    movingAverageColumn: "moving_average_30d_active_exchanges",
    currentVsMovingAverageColumn: "current_vs_30d_ma_active_exchanges",
  },
];

// Builds the INSERT column list and the matching value list from the contract.
// Every column name here comes from the internal contract above, never from
// user input.
export const buildCmcMarketMetricsInsert = (
  calculatedValues: Record<string, number | null>,
  currentValues: Record<string, number>,
  trailing: { source: string; observedAt: string },
) => {
  const columns = [
    "indicator",
    "series_id",
    ...CMC_MARKET_METRICS.map((metric) => metric.currentColumn),
    ...CMC_MARKET_METRICS.map((metric) => metric.previousColumn),
    ...CMC_MARKET_METRICS.map((metric) => metric.netChangeColumn),
    ...CMC_MARKET_METRICS.map((metric) => metric.percentChangeColumn),
    ...CMC_MARKET_METRICS.map((metric) => metric.movingAverageColumn),
    ...CMC_MARKET_METRICS.map(
      (metric) => metric.currentVsMovingAverageColumn,
    ),
    "source",
    "observed_at",
  ];

  const values: unknown[] = [
    CMC_MARKET_METRICS_INDICATOR,
    CMC_MARKET_METRICS_SERIES_ID,
    ...CMC_MARKET_METRICS.map((metric) => currentValues[metric.key]),
    ...CMC_MARKET_METRICS.map(
      (metric) => calculatedValues[metric.previousColumn] ?? null,
    ),
    ...CMC_MARKET_METRICS.map(
      (metric) => calculatedValues[metric.netChangeColumn] ?? null,
    ),
    ...CMC_MARKET_METRICS.map(
      (metric) => calculatedValues[metric.percentChangeColumn] ?? null,
    ),
    ...CMC_MARKET_METRICS.map(
      (metric) => calculatedValues[metric.movingAverageColumn] ?? null,
    ),
    ...CMC_MARKET_METRICS.map(
      (metric) =>
        calculatedValues[metric.currentVsMovingAverageColumn] ?? null,
    ),
    trailing.source,
    trailing.observedAt,
  ];

  return { columns, values };
};
