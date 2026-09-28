import pool from "../../../config/database.js";
import {
  ALTERNATIVE_FEAR_GREED_INDICATOR,
  ALTERNATIVE_FEAR_GREED_SERIES_ID,
  type AlternativeFearGreedObservation,
} from "../historical/alternative_crypto_fear_greed.js";

// The current observation is folded into the moving average, so only 11 prior
// days are needed to reach a 12-day window.
const MA_PERIOD = 12;

export type AlternativeFearGreedCurrentData = {
  observation: AlternativeFearGreedObservation;
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

// Averages the current observation together with the 11 most recent prior
// observations, giving at most 12 values. Days whose value is missing are
// dropped rather than counted as zero, so the window can reach back further
// than 12 calendar days to fill 12 valid readings.
const calculateMovingAverage = (
  current: number,
  historicalValues: number[],
): number | null => {
  const values = [current, ...historicalValues];

  if (values.length < MA_PERIOD) {
    return null;
  }

  const recentValues = values.slice(0, MA_PERIOD);

  return (
    recentValues.reduce((sum, value) => sum + value, 0) / MA_PERIOD
  );
};

export const injectAlternativeCryptoFearGreedCurrent = async (
  data: AlternativeFearGreedCurrentData,
) => {
  console.log("→ Alternative.me Fear & Greed current injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { observation } = data;

    if (!Number.isFinite(observation.value)) {
      throw new Error("Current Alternative.me Fear & Greed value is invalid");
    }

    const { rows: historicalRows } = await client.query<{
      value: string;
      classification: string;
      date: string;
    }>(
      `
        SELECT
          value,
          classification,
          date
        FROM historical.alternative_fear_greed
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT ${MA_PERIOD - 1}
      `,
      [observation.date],
    );

    // Postgres returns NUMERIC as a string, and a blank stored value would
    // become 0 through Number(), so blanks are treated as missing.
    const toFiniteNumber = (value: string): number | null => {
      const trimmed = value.trim();

      return trimmed === "" ? null : Number(trimmed);
    };

    const previousObservation = historicalRows[0] ?? null;

    const previousDayValue = previousObservation
      ? toFiniteNumber(previousObservation.value)
      : null;

    // Everything derived stays null until enough history exists, which is what
    // the nullable columns in current.alternative_fear_greed are for.
    const netChange =
      previousDayValue === null
        ? null
        : observation.value - previousDayValue;

    const percentChange = calculatePercentChange(
      observation.value,
      previousDayValue,
    );

    const historicalValues = historicalRows
      .map((row) => toFiniteNumber(row.value))
      .filter((value): value is number => value !== null);

    const movingAverage12d = calculateMovingAverage(
      observation.value,
      historicalValues,
    );

    // Absolute difference, matching the current_vs_*_ma_* convention used by
    // the IG, Russell 2000, CFTC, and Binance injectors.
    const currentVs12dMa =
      movingAverage12d === null
        ? null
        : observation.value - movingAverage12d;

    // updated_at is deliberately left out of the column list so the column
    // default applies on insert and NOW() is used on conflict.
    await client.query(
      `
        INSERT INTO current.alternative_fear_greed (
          indicator,
          series_id,

          current_value,
          current_classification,

          previous_day_value,
          previous_day_classification,

          net_change,
          percent_change,

          moving_average_12d,
          current_vs_12d_ma,

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

          $12
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,

          current_value = EXCLUDED.current_value,
          current_classification = EXCLUDED.current_classification,

          previous_day_value = EXCLUDED.previous_day_value,
          previous_day_classification = EXCLUDED.previous_day_classification,

          net_change = EXCLUDED.net_change,
          percent_change = EXCLUDED.percent_change,

          moving_average_12d = EXCLUDED.moving_average_12d,
          current_vs_12d_ma = EXCLUDED.current_vs_12d_ma,

          source = EXCLUDED.source,

          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        ALTERNATIVE_FEAR_GREED_INDICATOR,
        ALTERNATIVE_FEAR_GREED_SERIES_ID,

        observation.value,
        observation.classification,

        previousDayValue,
        previousObservation?.classification ?? null,

        netChange,
        percentChange,

        movingAverage12d,
        currentVs12dMa,

        observation.source,

        observation.date,
      ],
    );

    await client.query("COMMIT");

    console.log(
      `✓ Updated current Alternative.me crypto fear & greed: ${observation.value} (${observation.classification})`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
