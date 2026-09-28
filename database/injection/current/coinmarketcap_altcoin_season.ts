import pool from "../../../config/database.js";
import {
  CMC_ALT_SEASON_INDICATOR,
  CMC_ALT_SEASON_SERIES_ID,
} from "../historical/coinmarketcap_altcoin_season.js";

// The current observation is folded into each moving average, so 29 prior days
// cover the 30-day window and 59 cover the 60-day one.
const MA_PERIODS = { short: 30, long: 60 } as const;

export type CmcAltSeasonCurrentData = {
  index: number;
  altcoinMarketCap: number;
  observedAt: string;
  yearlyHigh: number;
  yearlyHighDate: string;
  yearlyLow: number;
  yearlyLowDate: string;
  source: string;
};

const calculatePercentChange = (
  current: number,
  previous: number | null,
): number | null => {
  if (previous === null || previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
};

// Averages the current observation together with the period-1 most recent prior
// observations, giving at most `period` values. Days whose value is missing are
// dropped rather than counted as zero, so the window can reach back further
// than `period` calendar days to fill `period` valid readings.
const calculateMovingAverage = (
  current: number,
  historicalValues: number[],
  period: number,
): number | null => {
  const values = [current, ...historicalValues];

  if (values.length < period) {
    return null;
  }

  const recentValues = values.slice(0, period);

  return recentValues.reduce((sum, value) => sum + value, 0) / period;
};

export const injectCoinMarketCapAltcoinSeasonCurrent = async (
  data: CmcAltSeasonCurrentData,
) => {
  console.log("→ CoinMarketCap altcoin season current injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (
      !Number.isFinite(data.index) ||
      !Number.isFinite(data.altcoinMarketCap)
    ) {
      throw new Error("Current CoinMarketCap altcoin season values are invalid");
    }

    if (
      !Number.isFinite(data.yearlyHigh) ||
      !Number.isFinite(data.yearlyLow)
    ) {
      throw new Error(
        "CoinMarketCap altcoin season yearly high/low values are invalid",
      );
    }

    // observed_at is stored as TIMESTAMPTZ because the API's snapshot_time is
    // a full timestamp, but the historical lookup is keyed on DATE, so the
    // calendar day is derived rather than relying on an implicit cast.
    const observedDate = data.observedAt.slice(0, 10);

    const { rows: historicalRows } = await client.query<{
      date: string;
      index_value: string;
      altcoin_market_cap: string;
    }>(
      `
        SELECT
          date,
          index_value,
          altcoin_market_cap
        FROM historical.coinmarketcap_alt_season_fear_greed
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT ${MA_PERIODS.long - 1}
      `,
      [observedDate],
    );

    // Postgres returns NUMERIC as a string, and Number("") is 0 rather than
    // NaN, so blank stored values are treated as missing.
    const toFiniteNumber = (value: string): number | null => {
      const trimmed = value.trim();

      return trimmed === "" ? null : Number(trimmed);
    };

    const previousObservation = historicalRows[0] ?? null;

    const previousDayIndex = previousObservation
      ? toFiniteNumber(previousObservation.index_value)
      : null;

    const previousDayAltcoinMarketCap = previousObservation
      ? toFiniteNumber(previousObservation.altcoin_market_cap)
      : null;

    const indexNetChange =
      previousDayIndex === null ? null : data.index - previousDayIndex;

    const indexPercentChange = calculatePercentChange(
      data.index,
      previousDayIndex,
    );

    const altcoinMarketCapNetChange =
      previousDayAltcoinMarketCap === null
        ? null
        : data.altcoinMarketCap - previousDayAltcoinMarketCap;

    const altcoinMarketCapPercentChange = calculatePercentChange(
      data.altcoinMarketCap,
      previousDayAltcoinMarketCap,
    );

    const historicalIndexValues = historicalRows
      .map((row) => toFiniteNumber(row.index_value))
      .filter((value): value is number => value !== null);

    const movingAverage30dIndex = calculateMovingAverage(
      data.index,
      historicalIndexValues,
      MA_PERIODS.short,
    );

    const movingAverage60dIndex = calculateMovingAverage(
      data.index,
      historicalIndexValues,
      MA_PERIODS.long,
    );

    // Absolute difference, matching the current_vs_*_ma_* convention used by
    // the other injectors.
    const currentVs30dMaIndex =
      movingAverage30dIndex === null
        ? null
        : data.index - movingAverage30dIndex;

    const currentVs60dMaIndex =
      movingAverage60dIndex === null
        ? null
        : data.index - movingAverage60dIndex;

    // updated_at is left out of the column list so the column default applies
    // on insert and NOW() is used on conflict.
    await client.query(
      `
        INSERT INTO current.coinmarketcap_alt_season_fear_greed (
          indicator,
          series_id,

          current_index,
          current_altcoin_market_cap,

          previous_day_index,
          previous_day_altcoin_market_cap,

          index_net_change,
          index_percent_change,

          altcoin_market_cap_net_change,
          altcoin_market_cap_percent_change,

          moving_average_30d_index,
          current_vs_30d_ma_index,

          moving_average_60d_index,
          current_vs_60d_ma_index,

          yearly_high_index,
          yearly_high_date,

          yearly_low_index,
          yearly_low_date,

          source,

          observed_at
        )
        VALUES (
          $1,
          $2,

          $3,
          $4,

          $5,
          $6,

          $7,
          $8,

          $9,
          $10,

          $11,
          $12,

          $13,
          $14,

          $15,
          $16,

          $17,
          $18,

          $19,

          $20
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,

          current_index = EXCLUDED.current_index,
          current_altcoin_market_cap = EXCLUDED.current_altcoin_market_cap,

          previous_day_index = EXCLUDED.previous_day_index,
          previous_day_altcoin_market_cap =
            EXCLUDED.previous_day_altcoin_market_cap,

          index_net_change = EXCLUDED.index_net_change,
          index_percent_change = EXCLUDED.index_percent_change,

          altcoin_market_cap_net_change =
            EXCLUDED.altcoin_market_cap_net_change,
          altcoin_market_cap_percent_change =
            EXCLUDED.altcoin_market_cap_percent_change,

          moving_average_30d_index =
            EXCLUDED.moving_average_30d_index,
          current_vs_30d_ma_index =
            EXCLUDED.current_vs_30d_ma_index,

          moving_average_60d_index =
            EXCLUDED.moving_average_60d_index,
          current_vs_60d_ma_index =
            EXCLUDED.current_vs_60d_ma_index,

          yearly_high_index = EXCLUDED.yearly_high_index,
          yearly_high_date = EXCLUDED.yearly_high_date,

          yearly_low_index = EXCLUDED.yearly_low_index,
          yearly_low_date = EXCLUDED.yearly_low_date,

          source = EXCLUDED.source,

          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        CMC_ALT_SEASON_INDICATOR,
        CMC_ALT_SEASON_SERIES_ID,

        data.index,
        data.altcoinMarketCap,

        previousDayIndex,
        previousDayAltcoinMarketCap,

        indexNetChange,
        indexPercentChange,

        altcoinMarketCapNetChange,
        altcoinMarketCapPercentChange,

        movingAverage30dIndex,
        currentVs30dMaIndex,

        movingAverage60dIndex,
        currentVs60dMaIndex,

        data.yearlyHigh,
        data.yearlyHighDate,

        data.yearlyLow,
        data.yearlyLowDate,

        data.source,

        data.observedAt,
      ],
    );

    await client.query("COMMIT");

    console.log(
      `✓ Updated current CoinMarketCap altcoin season index: ${data.index}`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
