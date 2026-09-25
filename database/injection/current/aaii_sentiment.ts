import pool from "../../../config/database.js";

type AaiiSentimentObservation = {
  date: string;
  bullish: number;
  neutral: number;
  bearish: number;
  bullBearSpread: number | null;
};

type AaiiSentimentData = {
  indicator: string;
  observations: AaiiSentimentObservation[];
  historical?: AaiiSentimentObservation | null;
};

export const injectAaiiSentimentLatest = async (data: AaiiSentimentData) => {
  console.log("→ AAII Sentiment current injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Observations are ascending (newest last), so the fallback must read from
    // the end. `.find()` would return the OLDEST observation instead.
    const currentObservation =
      data.historical ??
      data.observations
        .filter((observation) => observation.bullBearSpread !== null)
        .at(-1);

    if (!currentObservation) {
      throw new Error("No AAII Sentiment historical observation found");
    }

    if (currentObservation.bullBearSpread === null) {
      throw new Error(
        "AAII Sentiment current observation has no bull-bear spread",
      );
    }

    const previousResult = await client.query<{
      date: string;
      bullish: string;
      neutral: string;
      bearish: string;
      bull_bear_spread: string;
    }>(
      `
        SELECT
          date,
          bullish,
          neutral,
          bearish,
          bull_bear_spread
        FROM historical.aaii_sentiment
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 1
      `,
      [currentObservation.date],
    );

    const previous = previousResult.rows[0];

    if (!previous) {
      throw new Error("No previous AAII Sentiment observation found");
    }

    const currentBullish = currentObservation.bullish;
    const currentNeutral = currentObservation.neutral;
    const currentBearish = currentObservation.bearish;
    const currentBullBearSpread = currentObservation.bullBearSpread;

    const previousWeekBullish = Number(previous.bullish);
    const previousWeekNeutral = Number(previous.neutral);
    const previousWeekBearish = Number(previous.bearish);
    const previousWeekBullBearSpread = Number(previous.bull_bear_spread);

    if (
      !Number.isFinite(previousWeekBullish) ||
      !Number.isFinite(previousWeekNeutral) ||
      !Number.isFinite(previousWeekBearish) ||
      !Number.isFinite(previousWeekBullBearSpread)
    ) {
      throw new Error("Previous AAII Sentiment values are invalid");
    }

    const bullishNetChange = currentBullish - previousWeekBullish;
    const neutralNetChange = currentNeutral - previousWeekNeutral;
    const bearishNetChange = currentBearish - previousWeekBearish;
    const bullBearSpreadNetChange =
      currentBullBearSpread - previousWeekBullBearSpread;

    const bullishPercentChange =
      previousWeekBullish === 0
        ? 0
        : (bullishNetChange / previousWeekBullish) * 100;

    const neutralPercentChange =
      previousWeekNeutral === 0
        ? 0
        : (neutralNetChange / previousWeekNeutral) * 100;

    const bearishPercentChange =
      previousWeekBearish === 0
        ? 0
        : (bearishNetChange / previousWeekBearish) * 100;

    const bullBearSpreadPercentChange =
      previousWeekBullBearSpread === 0
        ? 0
        : (bullBearSpreadNetChange / previousWeekBullBearSpread) * 100;

    const movingAverageResult = await client.query<{
      moving_average_3w_bullish: string | null;
      moving_average_6w_bullish: string | null;
      moving_average_12w_bullish: string | null;
      moving_average_3w_neutral: string | null;
      moving_average_6w_neutral: string | null;
      moving_average_12w_neutral: string | null;
      moving_average_3w_bearish: string | null;
      moving_average_6w_bearish: string | null;
      moving_average_12w_bearish: string | null;
      moving_average_3w_bull_bear_spread: string | null;
      moving_average_6w_bull_bear_spread: string | null;
      moving_average_12w_bull_bear_spread: string | null;
    }>(
      `
        SELECT
          AVG(bullish) FILTER (
            WHERE date >= $1::date - INTERVAL '3 weeks'
          ) AS moving_average_3w_bullish,

          AVG(bullish) FILTER (
            WHERE date >= $1::date - INTERVAL '7 weeks'
          ) AS moving_average_6w_bullish,

          AVG(bullish) FILTER (
            WHERE date >= $1::date - INTERVAL '13 weeks'
          ) AS moving_average_12w_bullish,

          AVG(neutral) FILTER (
            WHERE date >= $1::date - INTERVAL '3 weeks'
          ) AS moving_average_3w_neutral,

          AVG(neutral) FILTER (
            WHERE date >= $1::date - INTERVAL '7 weeks'
          ) AS moving_average_6w_neutral,

          AVG(neutral) FILTER (
            WHERE date >= $1::date - INTERVAL '13 weeks'
          ) AS moving_average_12w_neutral,

          AVG(bearish) FILTER (
            WHERE date >= $1::date - INTERVAL '3 weeks'
          ) AS moving_average_3w_bearish,

          AVG(bearish) FILTER (
            WHERE date >= $1::date - INTERVAL '7 weeks'
          ) AS moving_average_6w_bearish,

          AVG(bearish) FILTER (
            WHERE date >= $1::date - INTERVAL '13 weeks'
          ) AS moving_average_12w_bearish,

          AVG(bull_bear_spread) FILTER (
            WHERE date >= $1::date - INTERVAL '3 weeks'
          ) AS moving_average_3w_bull_bear_spread,

          AVG(bull_bear_spread) FILTER (
            WHERE date >= $1::date - INTERVAL '7 weeks'
          ) AS moving_average_6w_bull_bear_spread,

          AVG(bull_bear_spread) FILTER (
            WHERE date >= $1::date - INTERVAL '13 weeks'
          ) AS moving_average_12w_bull_bear_spread

        FROM historical.aaii_sentiment
        WHERE date < $1::date
      `,
      [currentObservation.date],
    );

    const row = movingAverageResult.rows[0];

    if (!row) {
      throw new Error("No AAII Sentiment moving-average data found");
    }

    const toNumber = (value: string | null) =>
      value === null ? null : Number(value);

    const movingAverage3wBullish = toNumber(row.moving_average_3w_bullish);
    const movingAverage6wBullish = toNumber(row.moving_average_6w_bullish);
    const movingAverage12wBullish = toNumber(
      row.moving_average_12w_bullish,
    );

    const movingAverage3wNeutral = toNumber(row.moving_average_3w_neutral);
    const movingAverage6wNeutral = toNumber(row.moving_average_6w_neutral);
    const movingAverage12wNeutral = toNumber(
      row.moving_average_12w_neutral,
    );

    const movingAverage3wBearish = toNumber(row.moving_average_3w_bearish);
    const movingAverage6wBearish = toNumber(row.moving_average_6w_bearish);
    const movingAverage12wBearish = toNumber(
      row.moving_average_12w_bearish,
    );

    const movingAverage3wBullBearSpread = toNumber(
      row.moving_average_3w_bull_bear_spread,
    );
    const movingAverage6wBullBearSpread = toNumber(
      row.moving_average_6w_bull_bear_spread,
    );
    const movingAverage12wBullBearSpread = toNumber(
      row.moving_average_12w_bull_bear_spread,
    );

    const currentVs3wMaBullish =
      movingAverage3wBullish === null
        ? null
        : currentBullish - movingAverage3wBullish;

    const currentVs6wMaBullish =
      movingAverage6wBullish === null
        ? null
        : currentBullish - movingAverage6wBullish;

    const currentVs12wMaBullish =
      movingAverage12wBullish === null
        ? null
        : currentBullish - movingAverage12wBullish;

    const currentVs3wMaNeutral =
      movingAverage3wNeutral === null
        ? null
        : currentNeutral - movingAverage3wNeutral;

    const currentVs6wMaNeutral =
      movingAverage6wNeutral === null
        ? null
        : currentNeutral - movingAverage6wNeutral;

    const currentVs12wMaNeutral =
      movingAverage12wNeutral === null
        ? null
        : currentNeutral - movingAverage12wNeutral;

    const currentVs3wMaBearish =
      movingAverage3wBearish === null
        ? null
        : currentBearish - movingAverage3wBearish;

    const currentVs6wMaBearish =
      movingAverage6wBearish === null
        ? null
        : currentBearish - movingAverage6wBearish;

    const currentVs12wMaBearish =
      movingAverage12wBearish === null
        ? null
        : currentBearish - movingAverage12wBearish;

    const currentVs3wMaBullBearSpread =
      movingAverage3wBullBearSpread === null
        ? null
        : currentBullBearSpread - movingAverage3wBullBearSpread;

    const currentVs6wMaBullBearSpread =
      movingAverage6wBullBearSpread === null
        ? null
        : currentBullBearSpread - movingAverage6wBullBearSpread;

    const currentVs12wMaBullBearSpread =
      movingAverage12wBullBearSpread === null
        ? null
        : currentBullBearSpread - movingAverage12wBullBearSpread;

    await client.query(
      `
        INSERT INTO current.aaii_sentiment (
          indicator,
          series_id,

          current_bullish,
          current_neutral,
          current_bearish,
          current_bull_bear_spread,

          previous_week_bullish,
          previous_week_neutral,
          previous_week_bearish,
          previous_week_bull_bear_spread,

          bullish_net_change,
          neutral_net_change,
          bearish_net_change,
          bull_bear_spread_net_change,

          bullish_percent_change,
          neutral_percent_change,
          bearish_percent_change,
          bull_bear_spread_percent_change,

          moving_average_3w_bullish,
          current_vs_3w_ma_bullish,
          moving_average_6w_bullish,
          current_vs_6w_ma_bullish,
          moving_average_12w_bullish,
          current_vs_12w_ma_bullish,

          moving_average_3w_neutral,
          current_vs_3w_ma_neutral,
          moving_average_6w_neutral,
          current_vs_6w_ma_neutral,
          moving_average_12w_neutral,
          current_vs_12w_ma_neutral,

          moving_average_3w_bearish,
          current_vs_3w_ma_bearish,
          moving_average_6w_bearish,
          current_vs_6w_ma_bearish,
          moving_average_12w_bearish,
          current_vs_12w_ma_bearish,

          moving_average_3w_bull_bear_spread,
          current_vs_3w_ma_bull_bear_spread,
          moving_average_6w_bull_bear_spread,
          current_vs_6w_ma_bull_bear_spread,
          moving_average_12w_bull_bear_spread,
          current_vs_12w_ma_bull_bear_spread,

          observed_at
        )
        VALUES (
          $1, $2,

          $3, $4, $5, $6,

          $7, $8, $9, $10,

          $11, $12, $13, $14,

          $15, $16, $17, $18,

          $19, $20,
          $21, $22,
          $23, $24,

          $25, $26,
          $27, $28,
          $29, $30,

          $31, $32,
          $33, $34,
          $35, $36,

          $37, $38,
          $39, $40,
          $41, $42,

          $43
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,

          current_bullish = EXCLUDED.current_bullish,
          current_neutral = EXCLUDED.current_neutral,
          current_bearish = EXCLUDED.current_bearish,
          current_bull_bear_spread = EXCLUDED.current_bull_bear_spread,

          previous_week_bullish = EXCLUDED.previous_week_bullish,
          previous_week_neutral = EXCLUDED.previous_week_neutral,
          previous_week_bearish = EXCLUDED.previous_week_bearish,
          previous_week_bull_bear_spread = EXCLUDED.previous_week_bull_bear_spread,

          bullish_net_change = EXCLUDED.bullish_net_change,
          neutral_net_change = EXCLUDED.neutral_net_change,
          bearish_net_change = EXCLUDED.bearish_net_change,
          bull_bear_spread_net_change = EXCLUDED.bull_bear_spread_net_change,

          bullish_percent_change = EXCLUDED.bullish_percent_change,
          neutral_percent_change = EXCLUDED.neutral_percent_change,
          bearish_percent_change = EXCLUDED.bearish_percent_change,
          bull_bear_spread_percent_change = EXCLUDED.bull_bear_spread_percent_change,

          moving_average_3w_bullish = EXCLUDED.moving_average_3w_bullish,
          current_vs_3w_ma_bullish = EXCLUDED.current_vs_3w_ma_bullish,
          moving_average_6w_bullish = EXCLUDED.moving_average_6w_bullish,
          current_vs_6w_ma_bullish = EXCLUDED.current_vs_6w_ma_bullish,
          moving_average_12w_bullish = EXCLUDED.moving_average_12w_bullish,
          current_vs_12w_ma_bullish = EXCLUDED.current_vs_12w_ma_bullish,

          moving_average_3w_neutral = EXCLUDED.moving_average_3w_neutral,
          current_vs_3w_ma_neutral = EXCLUDED.current_vs_3w_ma_neutral,
          moving_average_6w_neutral = EXCLUDED.moving_average_6w_neutral,
          current_vs_6w_ma_neutral = EXCLUDED.current_vs_6w_ma_neutral,
          moving_average_12w_neutral = EXCLUDED.moving_average_12w_neutral,
          current_vs_12w_ma_neutral = EXCLUDED.current_vs_12w_ma_neutral,

          moving_average_3w_bearish = EXCLUDED.moving_average_3w_bearish,
          current_vs_3w_ma_bearish = EXCLUDED.current_vs_3w_ma_bearish,
          moving_average_6w_bearish = EXCLUDED.moving_average_6w_bearish,
          current_vs_6w_ma_bearish = EXCLUDED.current_vs_6w_ma_bearish,
          moving_average_12w_bearish = EXCLUDED.moving_average_12w_bearish,
          current_vs_12w_ma_bearish = EXCLUDED.current_vs_12w_ma_bearish,

          moving_average_3w_bull_bear_spread = EXCLUDED.moving_average_3w_bull_bear_spread,
          current_vs_3w_ma_bull_bear_spread = EXCLUDED.current_vs_3w_ma_bull_bear_spread,
          moving_average_6w_bull_bear_spread = EXCLUDED.moving_average_6w_bull_bear_spread,
          current_vs_6w_ma_bull_bear_spread = EXCLUDED.current_vs_6w_ma_bull_bear_spread,
          moving_average_12w_bull_bear_spread = EXCLUDED.moving_average_12w_bull_bear_spread,
          current_vs_12w_ma_bull_bear_spread = EXCLUDED.current_vs_12w_ma_bull_bear_spread,

          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        "aaii_sentiment",
        "aaii_sentiment",

        currentBullish,
        currentNeutral,
        currentBearish,
        currentBullBearSpread,

        previousWeekBullish,
        previousWeekNeutral,
        previousWeekBearish,
        previousWeekBullBearSpread,

        bullishNetChange,
        neutralNetChange,
        bearishNetChange,
        bullBearSpreadNetChange,

        bullishPercentChange,
        neutralPercentChange,
        bearishPercentChange,
        bullBearSpreadPercentChange,

        movingAverage3wBullish,
        currentVs3wMaBullish,
        movingAverage6wBullish,
        currentVs6wMaBullish,
        movingAverage12wBullish,
        currentVs12wMaBullish,

        movingAverage3wNeutral,
        currentVs3wMaNeutral,
        movingAverage6wNeutral,
        currentVs6wMaNeutral,
        movingAverage12wNeutral,
        currentVs12wMaNeutral,

        movingAverage3wBearish,
        currentVs3wMaBearish,
        movingAverage6wBearish,
        currentVs6wMaBearish,
        movingAverage12wBearish,
        currentVs12wMaBearish,

        movingAverage3wBullBearSpread,
        currentVs3wMaBullBearSpread,
        movingAverage6wBullBearSpread,
        currentVs6wMaBullBearSpread,
        movingAverage12wBullBearSpread,
        currentVs12wMaBullBearSpread,

        currentObservation.date,
      ],
    );

    await client.query("COMMIT");

    console.log("✓ AAII Sentiment current injection complete");

    return {
      indicator: "aaii_sentiment",
      seriesId: "aaii_sentiment",

      currentBullish,
      currentNeutral,
      currentBearish,
      currentBullBearSpread,

      previousWeekBullish,
      previousWeekNeutral,
      previousWeekBearish,
      previousWeekBullBearSpread,

      bullishNetChange,
      neutralNetChange,
      bearishNetChange,
      bullBearSpreadNetChange,

      bullishPercentChange,
      neutralPercentChange,
      bearishPercentChange,
      bullBearSpreadPercentChange,

      movingAverage3wBullish,
      currentVs3wMaBullish,
      movingAverage6wBullish,
      currentVs6wMaBullish,
      movingAverage12wBullish,
      currentVs12wMaBullish,

      movingAverage3wNeutral,
      currentVs3wMaNeutral,
      movingAverage6wNeutral,
      currentVs6wMaNeutral,
      movingAverage12wNeutral,
      currentVs12wMaNeutral,

      movingAverage3wBearish,
      currentVs3wMaBearish,
      movingAverage6wBearish,
      currentVs6wMaBearish,
      movingAverage12wBearish,
      currentVs12wMaBearish,

      movingAverage3wBullBearSpread,
      currentVs3wMaBullBearSpread,
      movingAverage6wBullBearSpread,
      currentVs6wMaBullBearSpread,
      movingAverage12wBullBearSpread,
      currentVs12wMaBullBearSpread,

      observedAt: currentObservation.date,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
