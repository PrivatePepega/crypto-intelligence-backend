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
      moving_average_30d_bullish: string | null;
      moving_average_30d_neutral: string | null;
      moving_average_30d_bearish: string | null;
      moving_average_30d_bull_bear_spread: string | null;
    }>(
      `
        SELECT
          AVG(bullish) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d_bullish,

          AVG(neutral) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d_neutral,

          AVG(bearish) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d_bearish,

          AVG(bull_bear_spread) FILTER (
            WHERE date >= $1::date - INTERVAL '30 days'
          ) AS moving_average_30d_bull_bear_spread

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

    const movingAverage30dBullish = toNumber(row.moving_average_30d_bullish);
    const movingAverage30dNeutral = toNumber(row.moving_average_30d_neutral);
    const movingAverage30dBearish = toNumber(row.moving_average_30d_bearish);
    const movingAverage30dBullBearSpread = toNumber(
      row.moving_average_30d_bull_bear_spread,
    );

    const currentVs30dMaBullish =
      movingAverage30dBullish === null
        ? null
        : currentBullish - movingAverage30dBullish;

    const currentVs30dMaNeutral =
      movingAverage30dNeutral === null
        ? null
        : currentNeutral - movingAverage30dNeutral;

    const currentVs30dMaBearish =
      movingAverage30dBearish === null
        ? null
        : currentBearish - movingAverage30dBearish;

    const currentVs30dMaBullBearSpread =
      movingAverage30dBullBearSpread === null
        ? null
        : currentBullBearSpread - movingAverage30dBullBearSpread;

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
          moving_average_30d_bullish,
          current_vs_30d_ma_bullish,
          moving_average_30d_neutral,
          current_vs_30d_ma_neutral,
          moving_average_30d_bearish,
          current_vs_30d_ma_bearish,
          moving_average_30d_bull_bear_spread,
          current_vs_30d_ma_bull_bear_spread,
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
          $20,
          $21,
          $22,
          $23,
          $24,
          $25,
          $26,
          $27
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

          moving_average_30d_bullish = EXCLUDED.moving_average_30d_bullish,
          current_vs_30d_ma_bullish = EXCLUDED.current_vs_30d_ma_bullish,

          moving_average_30d_neutral = EXCLUDED.moving_average_30d_neutral,
          current_vs_30d_ma_neutral = EXCLUDED.current_vs_30d_ma_neutral,

          moving_average_30d_bearish = EXCLUDED.moving_average_30d_bearish,
          current_vs_30d_ma_bearish = EXCLUDED.current_vs_30d_ma_bearish,

          moving_average_30d_bull_bear_spread = EXCLUDED.moving_average_30d_bull_bear_spread,
          current_vs_30d_ma_bull_bear_spread = EXCLUDED.current_vs_30d_ma_bull_bear_spread,

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

        movingAverage30dBullish,
        currentVs30dMaBullish,

        movingAverage30dNeutral,
        currentVs30dMaNeutral,

        movingAverage30dBearish,
        currentVs30dMaBearish,

        movingAverage30dBullBearSpread,
        currentVs30dMaBullBearSpread,

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

      movingAverage30dBullish,
      currentVs30dMaBullish,

      movingAverage30dNeutral,
      currentVs30dMaNeutral,

      movingAverage30dBearish,
      currentVs30dMaBearish,

      movingAverage30dBullBearSpread,
      currentVs30dMaBullBearSpread,

      observedAt: currentObservation.date,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
