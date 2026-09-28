// Types and helpers for the Binance futures trader-positioning injectors.
//
// The collector (collectors/binance/binanceFetcher.ts) returns one entry per
// trading symbol, and each entry holds the six Binance sub-sources separately:
// global long/short accounts, top-trader accounts, top-trader positions, open
// interest, funding, and taker buy/sell. Those six arrive as independent
// histories that are not aligned by index and do not necessarily cover the same
// dates, so they are joined by date here before anything is persisted.
//
import type {
  BinanceFundingPoint,
  BinanceLongShortPoint,
  BinanceOpenInterestPoint,
  BinancePositioningHistory,
  BinancePositioningLatest,
  BinanceTakerPoint,
} from "../../types/binance/binance.types.js";

// The payload shapes live in types/binance/binance.types.ts because the
// collector produces them; re-exported here so the injection layer and its
// callers have a single import site.
export type {
  BinanceFundingPoint,
  BinanceLongShortPoint,
  BinanceOpenInterestPoint,
  BinancePositioningHistory,
  BinancePositioningLatest,
  BinanceTakerPoint,
};

// Every numeric value arrives as a string because the upstream Zod schemas
// declare them as z.string(); Number() conversion happens at the merge boundary.

// One flattened row per calendar date, with all six sub-sources aligned.
export type BinanceDailyPositioning = {
  date: string;
  symbol: string;

  globalLongAccount: number;
  globalLongShortRatio: number;
  globalShortAccount: number;
  globalDate: string;

  topAccountLongAccount: number;
  topAccountLongShortRatio: number;
  topAccountShortAccount: number;
  topAccountDate: string;

  topPositionLongAccount: number;
  topPositionLongShortRatio: number;
  topPositionShortAccount: number;
  topPositionDate: string;

  sumOpenInterest: number;
  sumOpenInterestValue: number;
  cmcCirculatingSupply: number;
  openInterestDate: string;

  fundingRate: number;
  markPrice: number;
  fundingRateType: string;
  fundingDate: string;

  takerBuySellRatio: number;
  takerSellVolume: number;
  takerBuyVolume: number;
  takerDate: string;
};

export type BinancePositioningMarket = {
  // Must match the symbol the collector was asked for.
  symbol: string;
  // Value written to series_id; must match the FK target in
  // database/injection/indicators/.
  seriesId: string;
  // Table name without a schema prefix. Interpolated into SQL below, so this
  // is an internal constant only and must never come from user input.
  table: string;
  label: string;
};

export const BINANCE_POSITIONING_MARKETS = {
  btcusdt: {
    symbol: "BTCUSDT",
    seriesId: "binance_btcusdt",
    table: "btcusdt_binance_trader_positioning",
    label: "Binance BTCUSDT Trader Positioning",
  },
  ethusdt: {
    symbol: "ETHUSDT",
    seriesId: "binance_ethusdt",
    table: "ethusdt_binance_trader_positioning",
    label: "Binance ETHUSDT Trader Positioning",
  },
  solusdt: {
    symbol: "SOLUSDT",
    seriesId: "binance_solusdt",
    table: "solusdt_binance_trader_positioning",
    label: "Binance SOLUSDT Trader Positioning",
  },
  bnbusdt: {
    symbol: "BNBUSDT",
    seriesId: "binance_bnbusdt",
    table: "bnbusdt_binance_trader_positioning",
    label: "Binance BNBUSDT Trader Positioning",
  },
  xrpusdt: {
    symbol: "XRPUSDT",
    seriesId: "binance_xrpusdt",
    table: "xrpusdt_binance_trader_positioning",
    label: "Binance XRPUSDT Trader Positioning",
  },
  dogeusdt: {
    symbol: "DOGEUSDT",
    seriesId: "binance_dogeusdt",
    table: "dogeusdt_binance_trader_positioning",
    label: "Binance DOGEUSDT Trader Positioning",
  },
  linkusdt: {
    symbol: "LINKUSDT",
    seriesId: "binance_linkusdt",
    table: "linkusdt_binance_trader_positioning",
    label: "Binance LINKUSDT Trader Positioning",
  },
  aaveusdt: {
    symbol: "AAVEUSDT",
    seriesId: "binance_aaveusdt",
    table: "aaveusdt_binance_trader_positioning",
    label: "Binance AAVEUSDT Trader Positioning",
  },
} as const satisfies Record<string, BinancePositioningMarket>;

export type BinancePositioningMarketKey =
  keyof typeof BINANCE_POSITIONING_MARKETS;

// Number("") is 0, not NaN, so a blank upstream cell would otherwise sail
// through the completeness guard and be persisted as a real zero. Empty and
// whitespace-only values are mapped to NaN so the guard rejects them.
const toNumber = (value: string): number => {
  const trimmed = value.trim();

  return trimmed === "" ? Number.NaN : Number(trimmed);
};

// Later rows overwrite earlier ones for the same date. Binance returns each
// series in ascending time order, so for the 8-hourly funding feed this
// deliberately keeps the last settlement of the day.
const indexByDate = <T extends { date: string }>(rows: T[]) => {
  const map = new Map<string, T>();

  for (const row of rows) {
    map.set(row.date, row);
  }

  return map;
};

const buildDailyRow = (
  symbol: string,
  global: BinanceLongShortPoint,
  topAccountRow: BinanceLongShortPoint,
  topPositionRow: BinanceLongShortPoint,
  openInterestRow: BinanceOpenInterestPoint,
  fundingRow: BinanceFundingPoint,
  takerRow: BinanceTakerPoint,
): BinanceDailyPositioning => ({
  date: global.date,
  symbol,

  globalLongAccount: toNumber(global.longAccount),
  globalLongShortRatio: toNumber(global.longShortRatio),
  globalShortAccount: toNumber(global.shortAccount),
  globalDate: global.date,

  topAccountLongAccount: toNumber(topAccountRow.longAccount),
  topAccountLongShortRatio: toNumber(topAccountRow.longShortRatio),
  topAccountShortAccount: toNumber(topAccountRow.shortAccount),
  topAccountDate: topAccountRow.date,

  topPositionLongAccount: toNumber(topPositionRow.longAccount),
  topPositionLongShortRatio: toNumber(topPositionRow.longShortRatio),
  topPositionShortAccount: toNumber(topPositionRow.shortAccount),
  topPositionDate: topPositionRow.date,

  sumOpenInterest: toNumber(openInterestRow.sumOpenInterest),
  sumOpenInterestValue: toNumber(openInterestRow.sumOpenInterestValue),
  cmcCirculatingSupply: toNumber(openInterestRow.CMCCirculatingSupply),
  openInterestDate: openInterestRow.date,

  fundingRate: toNumber(fundingRow.fundingRate),
  markPrice: toNumber(fundingRow.markPrice),
  fundingRateType: fundingRow.rateType,
  fundingDate: fundingRow.date,

  takerBuySellRatio: toNumber(takerRow.buySellRatio),
  takerSellVolume: toNumber(takerRow.sellVol),
  takerBuyVolume: toNumber(takerRow.buyVol),
  takerDate: takerRow.date,
});

export const mergeBinanceDailyPositioning = (
  payload: BinancePositioningHistory,
): BinanceDailyPositioning[] => {
  const globalLongShort = indexByDate(payload.globalLongShort);
  const topAccount = indexByDate(payload.topAccount);
  const topPosition = indexByDate(payload.topPosition);
  const openInterest = indexByDate(payload.openInterest);
  const funding = indexByDate(payload.funding);
  const taker = indexByDate(payload.taker);

  // Every column in historical.btcusdt_binance_trader_positioning is NOT NULL,
  // so only dates where all six sub-sources have a reading are emitted rather
  // than writing NaN placeholders.
  const dates = [...globalLongShort.keys()]
    .filter(
      (date) =>
        topAccount.has(date) &&
        topPosition.has(date) &&
        openInterest.has(date) &&
        funding.has(date) &&
        taker.has(date),
    )
    .sort();

  return dates.map((date) =>
    buildDailyRow(
      payload.symbol,
      globalLongShort.get(date)!,
      topAccount.get(date)!,
      topPosition.get(date)!,
      openInterest.get(date)!,
      funding.get(date)!,
      taker.get(date)!,
    ),
  );
};

// Upstream blanks become NaN through Number(), and every column is NOT NULL, so
// historical injectors skip incomplete rows rather than aborting the whole
// transaction on one bad day.
export const isBinanceDailyComplete = (row: BinanceDailyPositioning) =>
  Number.isFinite(row.globalLongAccount) &&
  Number.isFinite(row.globalLongShortRatio) &&
  Number.isFinite(row.globalShortAccount) &&
  Number.isFinite(row.topAccountLongAccount) &&
  Number.isFinite(row.topAccountLongShortRatio) &&
  Number.isFinite(row.topAccountShortAccount) &&
  Number.isFinite(row.topPositionLongAccount) &&
  Number.isFinite(row.topPositionLongShortRatio) &&
  Number.isFinite(row.topPositionShortAccount) &&
  Number.isFinite(row.sumOpenInterest) &&
  Number.isFinite(row.sumOpenInterestValue) &&
  Number.isFinite(row.cmcCirculatingSupply) &&
  Number.isFinite(row.fundingRate) &&
  Number.isFinite(row.markPrice) &&
  Number.isFinite(row.takerBuySellRatio) &&
  Number.isFinite(row.takerSellVolume) &&
  Number.isFinite(row.takerBuyVolume);

export const MISSING_LATEST_SUB_SOURCES = [
  "globalLongShort",
  "topAccount",
  "topPosition",
  "openInterest",
  "funding",
  "taker",
] as const;

// Mirrors mergeBinanceDailyPositioning for the single-snapshot payload so both
// injectors consume the same BinanceDailyPositioning shape. A missing
// sub-source is fatal rather than skipped: every current_* column is NOT NULL,
// so there is no meaningful partial row to write.
export const mergeBinanceLatestPositioning = (
  payload: BinancePositioningLatest,
): BinanceDailyPositioning => {
  const missing = MISSING_LATEST_SUB_SOURCES.filter(
    (key) => payload[key] === undefined,
  );

  if (missing.length > 0) {
    throw new Error(
      `Binance ${payload.symbol} latest snapshot is missing: ${missing.join(", ")}`,
    );
  }

  return buildDailyRow(
    payload.symbol,
    payload.globalLongShort!,
    payload.topAccount!,
    payload.topPosition!,
    payload.openInterest!,
    payload.funding!,
    payload.taker!,
  );
};

export const selectBinancePositioningPayload = <T extends { symbol: string }>(
  data: T[],
  symbol: string,
): T | undefined => data.find((payload) => payload.symbol === symbol);

// The 17 numeric metrics this indicator tracks. Every metric maps to the same
// six columns in the current.* tables, so the column list, placeholders and
// values for the current injector are all generated from this one definition
// rather than written out by hand. Exported so it can be checked against the
// deployed table definition.
export const BINANCE_POSITIONING_MA_PERIOD = 12;

export type BinancePositioningMetric = {
  currentColumn: string;
  historicalColumn: string;
  previousColumn: string;
  netChangeColumn: string;
  percentChangeColumn: string;
  movingAverageColumn: string;
  currentVsMovingAverageColumn: string;
  getCurrentValue: (row: BinanceDailyPositioning) => number;
};
export const BINANCE_POSITIONING_METRICS: BinancePositioningMetric[] = [
  {
    currentColumn: "current_global_long_account",
    historicalColumn: "global_long_account",
    previousColumn: "previous_day_global_long_account",
    netChangeColumn: "global_long_account_net_change",
    percentChangeColumn: "global_long_account_percent_change",
    movingAverageColumn: "moving_average_12d_global_long_account",
    currentVsMovingAverageColumn: "current_vs_12d_ma_global_long_account",
    getCurrentValue: (row) => row.globalLongAccount,
  },
  {
    currentColumn: "current_global_long_short_ratio",
    historicalColumn: "global_long_short_ratio",
    previousColumn: "previous_day_global_long_short_ratio",
    netChangeColumn: "global_long_short_ratio_net_change",
    percentChangeColumn: "global_long_short_ratio_percent_change",
    movingAverageColumn: "moving_average_12d_global_long_short_ratio",
    currentVsMovingAverageColumn: "current_vs_12d_ma_global_long_short_ratio",
    getCurrentValue: (row) => row.globalLongShortRatio,
  },
  {
    currentColumn: "current_global_short_account",
    historicalColumn: "global_short_account",
    previousColumn: "previous_day_global_short_account",
    netChangeColumn: "global_short_account_net_change",
    percentChangeColumn: "global_short_account_percent_change",
    movingAverageColumn: "moving_average_12d_global_short_account",
    currentVsMovingAverageColumn: "current_vs_12d_ma_global_short_account",
    getCurrentValue: (row) => row.globalShortAccount,
  },
  {
    currentColumn: "current_top_account_long_account",
    historicalColumn: "top_account_long_account",
    previousColumn: "previous_day_top_account_long_account",
    netChangeColumn: "top_account_long_account_net_change",
    percentChangeColumn: "top_account_long_account_percent_change",
    movingAverageColumn: "moving_average_12d_top_account_long_account",
    currentVsMovingAverageColumn:
      "current_vs_12d_ma_top_account_long_account",
    getCurrentValue: (row) => row.topAccountLongAccount,
  },
  {
    currentColumn: "current_top_account_long_short_ratio",
    historicalColumn: "top_account_long_short_ratio",
    previousColumn: "previous_day_top_account_long_short_ratio",
    netChangeColumn: "top_account_long_short_ratio_net_change",
    percentChangeColumn: "top_account_long_short_ratio_percent_change",
    movingAverageColumn: "moving_average_12d_top_account_long_short_ratio",
    currentVsMovingAverageColumn:
      "current_vs_12d_ma_top_account_long_short_ratio",
    getCurrentValue: (row) => row.topAccountLongShortRatio,
  },
  {
    currentColumn: "current_top_account_short_account",
    historicalColumn: "top_account_short_account",
    previousColumn: "previous_day_top_account_short_account",
    netChangeColumn: "top_account_short_account_net_change",
    percentChangeColumn: "top_account_short_account_percent_change",
    movingAverageColumn: "moving_average_12d_top_account_short_account",
    currentVsMovingAverageColumn:
      "current_vs_12d_ma_top_account_short_account",
    getCurrentValue: (row) => row.topAccountShortAccount,
  },
  {
    currentColumn: "current_top_position_long_account",
    historicalColumn: "top_position_long_account",
    previousColumn: "previous_day_top_position_long_account",
    netChangeColumn: "top_position_long_account_net_change",
    percentChangeColumn: "top_position_long_account_percent_change",
    movingAverageColumn: "moving_average_12d_top_position_long_account",
    currentVsMovingAverageColumn:
      "current_vs_12d_ma_top_position_long_account",
    getCurrentValue: (row) => row.topPositionLongAccount,
  },
  {
    currentColumn: "current_top_position_long_short_ratio",
    historicalColumn: "top_position_long_short_ratio",
    previousColumn: "previous_day_top_position_long_short_ratio",
    netChangeColumn: "top_position_long_short_ratio_net_change",
    percentChangeColumn: "top_position_long_short_ratio_percent_change",
    movingAverageColumn: "moving_average_12d_top_position_long_short_ratio",
    currentVsMovingAverageColumn:
      "current_vs_12d_ma_top_position_long_short_ratio",
    getCurrentValue: (row) => row.topPositionLongShortRatio,
  },
  {
    currentColumn: "current_top_position_short_account",
    historicalColumn: "top_position_short_account",
    previousColumn: "previous_day_top_position_short_account",
    netChangeColumn: "top_position_short_account_net_change",
    percentChangeColumn: "top_position_short_account_percent_change",
    movingAverageColumn: "moving_average_12d_top_position_short_account",
    currentVsMovingAverageColumn:
      "current_vs_12d_ma_top_position_short_account",
    getCurrentValue: (row) => row.topPositionShortAccount,
  },
  {
    currentColumn: "current_sum_open_interest",
    historicalColumn: "sum_open_interest",
    previousColumn: "previous_day_sum_open_interest",
    netChangeColumn: "sum_open_interest_net_change",
    percentChangeColumn: "sum_open_interest_percent_change",
    movingAverageColumn: "moving_average_12d_sum_open_interest",
    currentVsMovingAverageColumn: "current_vs_12d_ma_sum_open_interest",
    getCurrentValue: (row) => row.sumOpenInterest,
  },
  {
    currentColumn: "current_sum_open_interest_value",
    historicalColumn: "sum_open_interest_value",
    previousColumn: "previous_day_sum_open_interest_value",
    netChangeColumn: "sum_open_interest_value_net_change",
    percentChangeColumn: "sum_open_interest_value_percent_change",
    movingAverageColumn: "moving_average_12d_sum_open_interest_value",
    currentVsMovingAverageColumn:
      "current_vs_12d_ma_sum_open_interest_value",
    getCurrentValue: (row) => row.sumOpenInterestValue,
  },
  {
    currentColumn: "current_cmc_circulating_supply",
    historicalColumn: "cmc_circulating_supply",
    previousColumn: "previous_day_cmc_circulating_supply",
    netChangeColumn: "cmc_circulating_supply_net_change",
    percentChangeColumn: "cmc_circulating_supply_percent_change",
    movingAverageColumn: "moving_average_12d_cmc_circulating_supply",
    currentVsMovingAverageColumn:
      "current_vs_12d_ma_cmc_circulating_supply",
    getCurrentValue: (row) => row.cmcCirculatingSupply,
  },
  {
    currentColumn: "current_funding_rate",
    historicalColumn: "funding_rate",
    previousColumn: "previous_day_funding_rate",
    netChangeColumn: "funding_rate_net_change",
    percentChangeColumn: "funding_rate_percent_change",
    movingAverageColumn: "moving_average_12d_funding_rate",
    currentVsMovingAverageColumn: "current_vs_12d_ma_funding_rate",
    getCurrentValue: (row) => row.fundingRate,
  },
  {
    currentColumn: "current_mark_price",
    historicalColumn: "mark_price",
    previousColumn: "previous_day_mark_price",
    netChangeColumn: "mark_price_net_change",
    percentChangeColumn: "mark_price_percent_change",
    movingAverageColumn: "moving_average_12d_mark_price",
    currentVsMovingAverageColumn: "current_vs_12d_ma_mark_price",
    getCurrentValue: (row) => row.markPrice,
  },
  {
    currentColumn: "current_taker_buy_sell_ratio",
    historicalColumn: "taker_buy_sell_ratio",
    previousColumn: "previous_day_taker_buy_sell_ratio",
    netChangeColumn: "taker_buy_sell_ratio_net_change",
    percentChangeColumn: "taker_buy_sell_ratio_percent_change",
    movingAverageColumn: "moving_average_12d_taker_buy_sell_ratio",
    currentVsMovingAverageColumn: "current_vs_12d_ma_taker_buy_sell_ratio",
    getCurrentValue: (row) => row.takerBuySellRatio,
  },
  {
    currentColumn: "current_taker_sell_volume",
    historicalColumn: "taker_sell_volume",
    previousColumn: "previous_day_taker_sell_volume",
    netChangeColumn: "taker_sell_volume_net_change",
    percentChangeColumn: "taker_sell_volume_percent_change",
    movingAverageColumn: "moving_average_12d_taker_sell_volume",
    currentVsMovingAverageColumn: "current_vs_12d_ma_taker_sell_volume",
    getCurrentValue: (row) => row.takerSellVolume,
  },
  {
    currentColumn: "current_taker_buy_volume",
    historicalColumn: "taker_buy_volume",
    previousColumn: "previous_day_taker_buy_volume",
    netChangeColumn: "taker_buy_volume_net_change",
    percentChangeColumn: "taker_buy_volume_percent_change",
    movingAverageColumn: "moving_average_12d_taker_buy_volume",
    currentVsMovingAverageColumn: "current_vs_12d_ma_taker_buy_volume",
    getCurrentValue: (row) => row.takerBuyVolume,
  },
];
