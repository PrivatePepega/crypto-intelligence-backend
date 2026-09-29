import pool from "../../../config/database.js";
import {
  ALTERNATIVE_FEAR_GREED_INDICATOR,
  ALTERNATIVE_FEAR_GREED_SERIES_ID,
  type AlternativeFearGreedObservation,
} from "../historical/alternative_crypto_fear_greed.js";

// Moving averages use calendar windows (30 days / 6 months / 12 months) and
// are computed in SQL, so an indicator without enough history simply reports
// null rather than throwing.

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

    const { rows: previousRows } = await client.query<{
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
        LIMIT 1
      `,
      [observation.date],
    );

    // Postgres returns NUMERIC as a string, and a blank stored value would
    // become 0 through Number(), so blanks are treated as missing.
    const toFiniteNumber = (value: string): number | null => {
      const trimmed = value.trim();

      return trimmed === "" ? null : Number(trimmed);
    };

    const previousObservation = previousRows[0] ?? null;

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

    // The current observation is folded into every window, matching the
    // behaviour this injector had before the windows moved to SQL. AVG() over
    // a window with no rows yields null, so 6/12 month averages stay null until
    // enough history has been collected.
    const { rows: movingAverageRows } = await client.query<{
      moving_average_30d: string | null;
      moving_average_6month: string | null;
      moving_average_12month: string | null;
    }>(
      `
        SELECT
          AVG(value) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d,

          AVG(value) FILTER (
            WHERE date >= $1::date - INTERVAL '6 months'
          ) AS moving_average_6month,

          AVG(value) FILTER (
            WHERE date >= $1::date - INTERVAL '12 months'
          ) AS moving_average_12month
        FROM (
          SELECT date, value
          FROM historical.alternative_fear_greed
          WHERE date < $1::date

          UNION ALL

          SELECT $1::date, $2::numeric
        ) AS windowed
        WHERE date <= $1::date
      `,
      [observation.date, observation.value],
    );

    const movingAverageRow = movingAverageRows[0];

    const toMovingAverage = (value: string | null | undefined): number | null =>
      value == null ? null : Number(value);

    const movingAverage30d = toMovingAverage(
      movingAverageRow?.moving_average_30d,
    );

    const movingAverage6month = toMovingAverage(
      movingAverageRow?.moving_average_6month,
    );

    const movingAverage12month = toMovingAverage(
      movingAverageRow?.moving_average_12month,
    );

    // Absolute difference, matching the current_vs_*_ma_* convention used by
    // the IG, Russell 2000, CFTC, and Binance injectors.
    const currentVs30dMa =
      movingAverage30d === null
        ? null
        : observation.value - movingAverage30d;

    const currentVs6monthMa =
      movingAverage6month === null
        ? null
        : observation.value - movingAverage6month;

    const currentVs12monthMa =
      movingAverage12month === null
        ? null
        : observation.value - movingAverage12month;

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

          moving_average_30d,
          current_vs_30d_ma,

          moving_average_6month,
          current_vs_6month_ma,

          moving_average_12month,
          current_vs_12month_ma,

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

          $16
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

          moving_average_30d = EXCLUDED.moving_average_30d,
          current_vs_30d_ma = EXCLUDED.current_vs_30d_ma,

          moving_average_6month = EXCLUDED.moving_average_6month,
          current_vs_6month_ma = EXCLUDED.current_vs_6month_ma,

          moving_average_12month = EXCLUDED.moving_average_12month,
          current_vs_12month_ma = EXCLUDED.current_vs_12month_ma,

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

        movingAverage30d,
        currentVs30dMa,

        movingAverage6month,
        currentVs6monthMa,

        movingAverage12month,
        currentVs12monthMa,

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
