import pool from "../../../config/database.js";
import {
  CMC_MARKET_METRICS,
  CMC_MARKET_METRICS_MA_PERIOD,
  buildCmcMarketMetricsInsert,
  type CmcMarketMetricsObservation,
} from "../coinmarketcapMarketMetrics.js";

type HistoricalRow = Record<string, string | null>;

// The current table keys on observed_at, not the historical date column, so
// `date` is not part of the current payload.
export type CmcMarketMetricsCurrentData = Omit<
  CmcMarketMetricsObservation,
  "date"
> & {
  observedAt: string;
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
// than 30 calendar days to fill 30 valid readings.
const calculateMovingAverage = (
  current: number,
  historicalValues: number[],
  period: number,
): number | null => {
  const values = [current, ...historicalValues];

  if (values.length < period) {
    return null;
  }

  return (
    values.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  );
};

export const injectCoinMarketCapCryptoMarketMetricsCurrent = async (
  data: CmcMarketMetricsCurrentData,
) => {
  console.log(
    "→ CoinMarketCap crypto market metrics current injection initialized",
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (!Number.isFinite(data.totalMarketCap)) {
      throw new Error(
        "Current CoinMarketCap crypto market metrics are invalid",
      );
    }

    // observed_at is stored as TIMESTAMPTZ because the API's snapshot time is a
    // full timestamp, but the historical lookup is keyed on DATE.
    const observedDate = data.observedAt.slice(0, 10);

    const { rows: historicalRows } = await client.query<HistoricalRow>(
      `
        SELECT ${CMC_MARKET_METRICS.map((metric) => metric.historicalColumn)
          .join(",\n               ")}
        FROM historical.coinmarketcap_general_crypto_metric
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT ${CMC_MARKET_METRICS_MA_PERIOD - 1}
      `,
      [observedDate],
    );

    // Postgres returns NUMERIC as a string, and Number("") is 0 rather than
    // NaN, so blank stored values are treated as missing.
    const toFiniteNumber = (value: string | null | undefined): number | null => {
      if (value === null || value === undefined) return null;

      const trimmed = String(value).trim();

      return trimmed === "" ? null : Number(trimmed);
    };

    const previousRow = historicalRows[0] ?? null;

    const currentValues: Record<string, number> = {};
    const calculatedValues: Record<string, number | null> = {};

    for (const metric of CMC_MARKET_METRICS) {
      const current = data[metric.key];

      const previous = previousRow
        ? toFiniteNumber(previousRow[metric.historicalColumn])
        : null;

      const historicalValues = historicalRows
        .map((row) => toFiniteNumber(row[metric.historicalColumn]))
        .filter((value): value is number => value !== null);

      const movingAverage = calculateMovingAverage(
        current,
        historicalValues,
        CMC_MARKET_METRICS_MA_PERIOD,
      );

      currentValues[metric.key] = current;
      calculatedValues[metric.previousColumn] = previous;
      calculatedValues[metric.netChangeColumn] =
        previous === null ? null : current - previous;
      calculatedValues[metric.percentChangeColumn] = calculatePercentChange(
        current,
        previous,
      );
      calculatedValues[metric.movingAverageColumn] = movingAverage;

      // Absolute difference, matching the current_vs_*_ma_* convention used by
      // the other injectors.
      calculatedValues[metric.currentVsMovingAverageColumn] =
        movingAverage === null ? null : current - movingAverage;
    }

    // CoinMarketCap supplies explicit yesterday figures for total market cap and
    // total 24h volume. Those are the authoritative previous-day values, and
    // they are NOT NULL in the current table, so they are used in preference to
    // the previous historical row.
    if (
      !Number.isFinite(data.totalMarketCapYesterday) ||
      !Number.isFinite(data.totalVolume24hYesterday)
    ) {
      throw new Error(
        "CoinMarketCap yesterday total market cap and volume values are required",
      );
    }

    calculatedValues.previous_day_total_market_cap =
      data.totalMarketCapYesterday;
    calculatedValues.previous_day_total_volume_24h =
      data.totalVolume24hYesterday;
    calculatedValues.total_market_cap_net_change =
      data.totalMarketCap - data.totalMarketCapYesterday;
    calculatedValues.total_market_cap_percent_change = calculatePercentChange(
      data.totalMarketCap,
      data.totalMarketCapYesterday,
    );
    calculatedValues.total_volume_24h_net_change =
      data.totalVolume24h - data.totalVolume24hYesterday;
    calculatedValues.total_volume_24h_percent_change = calculatePercentChange(
      data.totalVolume24h,
      data.totalVolume24hYesterday,
    );

    const { columns, values } = buildCmcMarketMetricsInsert(
      calculatedValues,
      currentValues,
      { source: data.source, observedAt: data.observedAt },
    );

    if (columns.length !== values.length) {
      throw new Error(
        `Column/value length mismatch: ${columns.length} vs ${values.length}`,
      );
    }

    const placeholders = values.map((_, index) => `$${index + 1}`);

    // series_id is skipped from the DO UPDATE along with the primary key; it is
    // a constant so it never needs refreshing.
    const updateColumns = columns
      .slice(1)
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(",\n            ");

    // updated_at is left out of the column list so the column default applies on
    // insert and NOW() is used on conflict.
    await client.query(
      `
        INSERT INTO current.coinmarketcap_general_crypto_metric (
            ${columns.join(",\n            ")}
        )
        VALUES (
            ${placeholders.join(",\n            ")}
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
            ${updateColumns},
            updated_at = NOW()
      `,
      values,
    );

    await client.query("COMMIT");

    console.log(
      "✓ Updated current CoinMarketCap crypto market metrics",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
