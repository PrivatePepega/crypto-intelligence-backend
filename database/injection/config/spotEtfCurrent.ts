import pool from "../../../config/database.js";
import {
  SPOT_ETF_COUNTRY_CODE,
  SPOT_ETF_MA_PERIOD,
  SPOT_ETF_MARKETS,
  SPOT_ETF_METRICS,
  type SpotEtfMarket,
  type SpotEtfMetricKey,
} from "./spotEtf.js";

export type SpotEtfCurrentPayload = {
  netFlow: number;
  valueTraded: number;
  netAssets: number;
  cumulativeNetFlow: number;
  observedAt: string;
};

// Postgres returns NUMERIC as a string, so rows are typed as string and
// converted explicitly rather than trusted as numbers.
type HistoricalRow = Record<string, string | null>;

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
): number | null => {
  const values = [current, ...historicalValues];

  if (values.length < SPOT_ETF_MA_PERIOD) {
    return null;
  }

  return (
    values
      .slice(0, SPOT_ETF_MA_PERIOD)
      .reduce((sum, value) => sum + value, 0) / SPOT_ETF_MA_PERIOD
  );
};

// Number("") is 0 rather than NaN, so blank stored values are treated as
// missing instead of silently becoming a real zero.
const toFiniteNumber = (
  value: string | null | undefined,
): number | null => {
  if (value === null || value === undefined) return null;

  const trimmed = String(value).trim();

  return trimmed === "" ? null : Number(trimmed);
};

export const injectSpotEtfCurrent = async (
  market: SpotEtfMarket,
  current: SpotEtfCurrentPayload,
) => {
  console.log(`→ ${market.label} current injection initialized`);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const metric of SPOT_ETF_METRICS) {
      if (!Number.isFinite(current[metric.key])) {
        throw new Error(
          `Current ${market.label} ${metric.key} is not a finite number`,
        );
      }
    }

    // One query serves both purposes: the most recent prior row is the
    // previous day, and the same rows feed the 30-day moving average.
    const { rows: historicalRows } = await client.query<HistoricalRow>(
      `
        SELECT ${SPOT_ETF_METRICS.map((metric) => metric.historicalColumn)
          .join(",\n                 ")}
        FROM historical.${market.table}
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT ${SPOT_ETF_MA_PERIOD - 1}
      `,
      [current.observedAt],
    );

    const previousRow = historicalRows[0] ?? null;

    // Every column name below comes from the internal metric contract, never
    // from user input.
    const columns = [
      "indicator",
      "series_id",
      ...SPOT_ETF_METRICS.map((metric) => metric.currentColumn),
      ...SPOT_ETF_METRICS.map((metric) => metric.previousColumn),
      ...SPOT_ETF_METRICS.map((metric) => metric.netChangeColumn),
      ...SPOT_ETF_METRICS.map((metric) => metric.percentChangeColumn),
      ...SPOT_ETF_METRICS.map((metric) => metric.movingAverageColumn),
      ...SPOT_ETF_METRICS.map(
        (metric) => metric.currentVsMovingAverageColumn,
      ),
      "asset",
      "country_code",
      "observed_at",
    ];

    const currentValues = SPOT_ETF_METRICS.map((metric) => current[metric.key]);

    const previousValues = SPOT_ETF_METRICS.map((metric) =>
      previousRow ? toFiniteNumber(previousRow[metric.historicalColumn]) : null,
    );

    const netChangeValues = SPOT_ETF_METRICS.map((_, index) => {
      const previous = previousValues[index]!;

      return previous === null ? null : currentValues[index]! - previous;
    });

    const percentChangeValues = SPOT_ETF_METRICS.map((_, index) =>
      calculatePercentChange(currentValues[index]!, previousValues[index]!),
    );

    const movingAverageValues = SPOT_ETF_METRICS.map((metric) =>
      calculateMovingAverage(
        current[metric.key],
        historicalRows
          .map((row) => toFiniteNumber(row[metric.historicalColumn]))
          .filter((value): value is number => value !== null),
      ),
    );

    // Absolute difference, matching the current_vs_*_ma_* convention used by
    // every other injector in the repo.
    const currentVsMovingAverageValues = movingAverageValues.map(
      (movingAverage, index) =>
        movingAverage === null ? null : currentValues[index]! - movingAverage,
    );

    const values: unknown[] = [
      // The indicator key is the table name, so each market owns its own row.
      market.table,
      market.seriesId,
      ...currentValues,
      ...previousValues,
      ...netChangeValues,
      ...percentChangeValues,
      ...movingAverageValues,
      ...currentVsMovingAverageValues,
      market.symbol,
      SPOT_ETF_COUNTRY_CODE,
      current.observedAt,
    ];

    if (columns.length !== values.length) {
      throw new Error(
        `Column/value length mismatch: ${columns.length} vs ${values.length}`,
      );
    }

    const placeholders = values.map((_, index) => `$${index + 1}`);

    // series_id is skipped along with the primary key; it is a constant.
    const updateColumns = columns
      .slice(1)
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(",\n            ");

    // updated_at is left out of the column list so the column default applies
    // on insert and NOW() is used on conflict.
    await client.query(
      `
        INSERT INTO current.${market.table} (
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
      `✓ ${market.label} current injection complete for ${current.observedAt}`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
