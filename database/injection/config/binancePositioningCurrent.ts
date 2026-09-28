import pool from "../../../config/database.js";
import {
  BINANCE_POSITIONING_MA_PERIOD,
  BINANCE_POSITIONING_METRICS,
  isBinanceDailyComplete,
  mergeBinanceLatestPositioning,
  selectBinancePositioningPayload,
  type BinanceDailyPositioning,
  type BinancePositioningLatest,
  type BinancePositioningMarket,
} from "./binancePositioning.js";

type HistoricalRow = Record<string, unknown>;

type CurrentValues = Record<string, number | null>;

// Blank upstream cells arrive as "" and Number("") is 0, so they are treated as
// missing rather than silently becoming a real zero.
const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed === "" ? null : Number(trimmed);
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
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

// Averages the current observation together with the MA_PERIOD-1 most recent
// prior observations, giving at most MA_PERIOD values. Historical days whose
// value is missing are dropped rather than counted as zero, so the window can
// reach back further than 12 calendar days to fill 12 valid readings.
const calculateMovingAverage = (
  current: number,
  historicalValues: number[],
): number | null => {
  const values = [current, ...historicalValues];

  if (values.length < BINANCE_POSITIONING_MA_PERIOD) {
    return null;
  }

  const recentValues = values.slice(0, BINANCE_POSITIONING_MA_PERIOD);

  return (
    recentValues.reduce((sum, value) => sum + value, 0) /
    BINANCE_POSITIONING_MA_PERIOD
  );
};

// Absolute difference, matching the current_vs_*_ma_* convention already used
// by the IG, Russell 2000, and CFTC injectors.
const calculateVsMovingAverage = (
  current: number,
  movingAverage: number | null,
): number | null => {
  if (movingAverage === null) {
    return null;
  }

  return current - movingAverage;
};

const buildCurrentValues = (
  row: BinanceDailyPositioning,
  historicalRows: HistoricalRow[],
): CurrentValues => {
  const currentValues: CurrentValues = {};

  const previousRow = historicalRows[0] ?? null;

  for (const metric of BINANCE_POSITIONING_METRICS) {
    const current = metric.getCurrentValue(row);

    const previous =
      previousRow === null
        ? null
        : toFiniteNumber(previousRow[metric.historicalColumn]);

    const historicalValues = historicalRows
      .map((historicalRow) =>
        toFiniteNumber(historicalRow[metric.historicalColumn]),
      )
      .filter((value): value is number => value !== null);

    const movingAverage = calculateMovingAverage(
      current,
      historicalValues,
    );

    currentValues[metric.currentColumn] = current;
    currentValues[metric.previousColumn] = previous;
    currentValues[metric.netChangeColumn] =
      previous === null ? null : current - previous;
    currentValues[metric.percentChangeColumn] = calculatePercentChange(
      current,
      previous,
    );
    currentValues[metric.movingAverageColumn] = movingAverage;
    currentValues[metric.currentVsMovingAverageColumn] =
      calculateVsMovingAverage(current, movingAverage);
  }

  return currentValues;
};

export const injectBinancePositioningLatest = async (
  market: BinancePositioningMarket,
  data: BinancePositioningLatest[],
) => {
  console.log(`→ ${market.label} current injection initialized`);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // SYMBOLS covers every configured market, so this entry is selected by
    // symbol rather than assumed to be the only one.
    const payload = selectBinancePositioningPayload(data, market.symbol);

    if (!payload) {
      throw new Error(`No Binance payload matched symbol "${market.symbol}"`);
    }

    const row = mergeBinanceLatestPositioning(payload);

    // Every current_* column is NOT NULL, so an incomplete snapshot cannot be
    // written at all.
    if (!isBinanceDailyComplete(row)) {
      throw new Error(
        `Binance ${market.symbol} latest snapshot has non-numeric values`,
      );
    }

    const observedAt = row.date;

    // MA_PERIOD-1 prior days are needed because the current observation is
    // folded into the moving average above.
    const historicalResult = await client.query<HistoricalRow>(
      `
        SELECT ${BINANCE_POSITIONING_METRICS.map(
          (metric) => metric.historicalColumn,
        ).join(",\n               ")}
        FROM historical.${market.table}
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT ${BINANCE_POSITIONING_MA_PERIOD - 1}
      `,
      [observedAt],
    );

    const currentValues = buildCurrentValues(
      row,
      historicalResult.rows,
    );

    // Every column name below comes from the internal metric contract, not
    // from user input.
    const columns = [
      "indicator",
      "series_id",
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => metric.currentColumn,
      ),
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => metric.previousColumn,
      ),
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => metric.netChangeColumn,
      ),
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => metric.percentChangeColumn,
      ),
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => metric.movingAverageColumn,
      ),
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => metric.currentVsMovingAverageColumn,
      ),
      "symbol",
      "global_date",
      "top_account_date",
      "top_position_date",
      "open_interest_date",
      "funding_date",
      "taker_date",
      "observed_at",
    ];

    const values: unknown[] = [
      market.table,
      market.seriesId,
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => currentValues[metric.currentColumn],
      ),
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => currentValues[metric.previousColumn],
      ),
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => currentValues[metric.netChangeColumn],
      ),
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => currentValues[metric.percentChangeColumn],
      ),
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => currentValues[metric.movingAverageColumn],
      ),
      ...BINANCE_POSITIONING_METRICS.map(
        (metric) => currentValues[metric.currentVsMovingAverageColumn],
      ),
      row.symbol,
      row.globalDate,
      row.topAccountDate,
      row.topPositionDate,
      row.openInterestDate,
      row.fundingDate,
      row.takerDate,
      observedAt,
    ];

    if (columns.length !== values.length) {
      throw new Error(
        `Column/value length mismatch: ${columns.length} vs ${values.length}`,
      );
    }

    const placeholders = values.map((_, index) => `$${index + 1}`);

    const updateColumns = columns
      .slice(1)
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(",\n            ");

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

    console.log(`✓ ${market.label} current injection complete`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
