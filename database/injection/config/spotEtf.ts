// Shared types, market configuration and metric contract for the SoSoValue
// spot-ETF injectors.
//
// The collector makes one pass per script and returns an entry for every spot
// ETF it tracks, each with a current snapshot and its own history, so all six
// markets are injected from that single payload and narrowed by asset.

export type SpotEtfObservation = {
  date: string;
  netFlow: number;
  valueTraded: number;
  netAssets: number;
  cumulativeNetFlow: number;
};

export type SpotEtfCurrentSnapshot = SpotEtfObservation;

// The `current` block on the collector's payload carries the same four metrics
// plus the observation date, keyed on the same names.
export type SpotEtfMetricKey =
  | "netFlow"
  | "valueTraded"
  | "netAssets"
  | "cumulativeNetFlow";

export type SpotEtfMarket = {
  // Collector symbol, e.g. "ETH". Must match SosoValueEtfSymbol.
  symbol: string;
  // Value written to series_id; must match the FK target in
  // database/injection/indicators/.
  seriesId: string;
  // Table name without a schema prefix. Interpolated into SQL below, so this
  // is an internal constant only and must never come from user input.
  table: string;
  label: string;
};

// Single source of truth for the six spot-ETF markets. The seriesIds must match
// the indicator metadata in database/injection/indicators/spotetf*.ts, which
// differ from both the indicator's own id and these table names.
export const SPOT_ETF_MARKETS = {
  btc: {
    symbol: "BTC",
    seriesId: "spot_etf_btc",
    table: "btc_spot_etf",
    label: "BTC Spot ETF",
  },
  eth: {
    symbol: "ETH",
    seriesId: "spot_etf_eth",
    table: "eth_spot_etf",
    label: "ETH Spot ETF",
  },
  sol: {
    symbol: "SOL",
    seriesId: "spot_etf_sol",
    table: "sol_spot_etf",
    label: "SOL Spot ETF",
  },
  xrp: {
    symbol: "XRP",
    seriesId: "spot_etf_xrp",
    table: "xrp_spot_etf",
    label: "XRP Spot ETF",
  },
  doge: {
    symbol: "DOGE",
    seriesId: "spot_etf_doge",
    table: "doge_spot_etf",
    label: "DOGE Spot ETF",
  },
  link: {
    symbol: "LINK",
    seriesId: "spot_etf_link",
    table: "link_spot_etf",
    label: "LINK Spot ETF",
  },
} as const satisfies Record<string, SpotEtfMarket>;

export type SpotEtfMarketKey = keyof typeof SPOT_ETF_MARKETS;

// SoSoValue only publishes U.S. spot ETF flows; the collector hardcodes this as
// z.literal("US").
export const SPOT_ETF_COUNTRY_CODE = "US";

// The current observation is folded into the average, so 29 prior days are
// needed for a 30-day window.
export const SPOT_ETF_MA_PERIOD = 30;

export type SpotEtfMetric = {
  key: SpotEtfMetricKey;
  historicalColumn: string;
  currentColumn: string;
  previousColumn: string;
  netChangeColumn: string;
  percentChangeColumn: string;
  movingAverageColumn: string;
  currentVsMovingAverageColumn: string;
};

// Column names are shared across all six markets: only the table differs, so
// the per-market column list is the same shape for each.
export const SPOT_ETF_METRICS: SpotEtfMetric[] = [
  {
    key: "netFlow",
    historicalColumn: "net_flow",
    currentColumn: "current_net_flow",
    previousColumn: "previous_day_net_flow",
    netChangeColumn: "net_flow_net_change",
    percentChangeColumn: "net_flow_percent_change",
    movingAverageColumn: "moving_average_30d_net_flow",
    currentVsMovingAverageColumn: "current_vs_30d_ma_net_flow",
  },
  {
    key: "valueTraded",
    historicalColumn: "value_traded",
    currentColumn: "current_value_traded",
    previousColumn: "previous_day_value_traded",
    netChangeColumn: "value_traded_net_change",
    percentChangeColumn: "value_traded_percent_change",
    movingAverageColumn: "moving_average_30d_value_traded",
    currentVsMovingAverageColumn: "current_vs_30d_ma_value_traded",
  },
  {
    key: "netAssets",
    historicalColumn: "net_assets",
    currentColumn: "current_net_assets",
    previousColumn: "previous_day_net_assets",
    netChangeColumn: "net_assets_net_change",
    percentChangeColumn: "net_assets_percent_change",
    movingAverageColumn: "moving_average_30d_net_assets",
    currentVsMovingAverageColumn: "current_vs_30d_ma_net_assets",
  },
  {
    key: "cumulativeNetFlow",
    historicalColumn: "cumulative_net_flow",
    currentColumn: "current_cumulative_net_flow",
    previousColumn: "previous_day_cumulative_net_flow",
    netChangeColumn: "cumulative_net_flow_net_change",
    percentChangeColumn: "cumulative_net_flow_percent_change",
    movingAverageColumn: "moving_average_30d_cumulative_net_flow",
    currentVsMovingAverageColumn:
      "current_vs_30d_ma_cumulative_net_flow",
  },
];

// Every metric column is NOT NULL, so a day with any non-numeric value is
// skipped rather than aborting a whole transaction.
export const isSpotEtfObservationComplete = (
  observation: SpotEtfObservation,
) =>
  SPOT_ETF_METRICS.every((metric) =>
    Number.isFinite(observation[metric.key]),
  );
