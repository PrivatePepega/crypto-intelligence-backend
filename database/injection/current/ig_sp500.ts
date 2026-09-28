import pool from "../../../config/database.js";

type IgSentimentObservation = {
  asset: string;
  long: number;
  short: number;
  net: number;
  source: string;
  date: string;
};

type IgSentimentData = {
  data: IgSentimentObservation[];
};

const IG_SP500_ASSET = "S&P 500";
const IG_SP500_SERIES_ID = "ig_sp500";

const selectLatestIgObservation = (
  data: IgSentimentData,
  asset: string,
) => {
  return data.data.find(
    (observation) => observation.asset === asset,
  );
};

export const injectIgSp500Latest = async (
  data: IgSentimentData,
) => {
  console.log("→ IG S&P 500 current injection initialized");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const observation = selectLatestIgObservation(
      data,
      IG_SP500_ASSET,
    );

    if (!observation) {
      throw new Error(
        `No IG observation matched asset "${IG_SP500_ASSET}"`,
      );
    }

    if (
      !Number.isFinite(observation.long) ||
      !Number.isFinite(observation.short) ||
      !Number.isFinite(observation.net)
    ) {
      throw new Error("Current IG S&P 500 values are invalid");
    }

    const previousResult = await client.query<{
      date: string;
      long: string;
      short: string;
      net: string;
    }>(
      `
        SELECT
          date,
          long,
          short,
          net
        FROM historical.sp500_ig_sentiment
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 1
      `,
      [observation.date],
    );

    const previousObservation = previousResult.rows[0];

    const currentLong = observation.long;
    const currentShort = observation.short;
    const currentNet = observation.net;

    const previousLong = previousObservation
      ? Number(previousObservation.long)
      : null;

    const previousShort = previousObservation
      ? Number(previousObservation.short)
      : null;

    const previousNet = previousObservation
      ? Number(previousObservation.net)
      : null;

    if (
      (previousLong !== null &&
        !Number.isFinite(previousLong)) ||
      (previousShort !== null &&
        !Number.isFinite(previousShort)) ||
      (previousNet !== null &&
        !Number.isFinite(previousNet))
    ) {
      throw new Error(
        "Previous IG S&P 500 values are invalid",
      );
    }

    const longNetChange =
      previousLong !== null
        ? currentLong - previousLong
        : null;

    const shortNetChange =
      previousShort !== null
        ? currentShort - previousShort
        : null;

    const netNetChange =
      previousNet !== null
        ? currentNet - previousNet
        : null;

    const longPercentChange =
      previousLong !== null && previousLong !== 0
        ? (longNetChange! / previousLong) * 100
        : null;

    const shortPercentChange =
      previousShort !== null && previousShort !== 0
        ? (shortNetChange! / previousShort) * 100
        : null;

    const netPercentChange =
      previousNet !== null && previousNet !== 0
        ? (netNetChange! / previousNet) * 100
        : null;

    /*
     * IG publishes on trading days, so moving averages use
     * the last N prior observations rather than calendar days.
     *
     * If insufficient historical observations exist,
     * the corresponding moving average remains NULL.
     */
    const historicalResult = await client.query<{
      date: string;
      long: string;
      short: string;
      net: string;
    }>(
      `
        SELECT
          date,
          long,
          short,
          net
        FROM historical.sp500_ig_sentiment
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 12
      `,
      [observation.date],
    );

    const historicalRows = historicalResult.rows
      .map((row) => ({
        long: Number(row.long),
        short: Number(row.short),
        net: Number(row.net),
      }))
      .filter(
        (row) =>
          Number.isFinite(row.long) &&
          Number.isFinite(row.short) &&
          Number.isFinite(row.net),
      );

    const calculateMovingAverage = (
      values: number[],
      period: number,
    ): number | null => {
      if (values.length < period) {
        return null;
      }

      const periodValues = values.slice(0, period);

      return (
        periodValues.reduce(
          (sum, value) => sum + value,
          0,
        ) / period
      );
    };

    const longSeries = historicalRows.map(
      (row) => row.long,
    );

    const shortSeries = historicalRows.map(
      (row) => row.short,
    );

    const netSeries = historicalRows.map(
      (row) => row.net,
    );

    const movingAverage3dLong =
      calculateMovingAverage(longSeries, 3);

    const movingAverage6dLong =
      calculateMovingAverage(longSeries, 6);

    const movingAverage12dLong =
      calculateMovingAverage(longSeries, 12);

    const movingAverage3dShort =
      calculateMovingAverage(shortSeries, 3);

    const movingAverage6dShort =
      calculateMovingAverage(shortSeries, 6);

    const movingAverage12dShort =
      calculateMovingAverage(shortSeries, 12);

    const movingAverage3dNet =
      calculateMovingAverage(netSeries, 3);

    const movingAverage6dNet =
      calculateMovingAverage(netSeries, 6);

    const movingAverage12dNet =
      calculateMovingAverage(netSeries, 12);

    const currentVs3dMaLong =
      movingAverage3dLong !== null
        ? currentLong - movingAverage3dLong
        : null;

    const currentVs6dMaLong =
      movingAverage6dLong !== null
        ? currentLong - movingAverage6dLong
        : null;

    const currentVs12dMaLong =
      movingAverage12dLong !== null
        ? currentLong - movingAverage12dLong
        : null;

    const currentVs3dMaShort =
      movingAverage3dShort !== null
        ? currentShort - movingAverage3dShort
        : null;

    const currentVs6dMaShort =
      movingAverage6dShort !== null
        ? currentShort - movingAverage6dShort
        : null;

    const currentVs12dMaShort =
      movingAverage12dShort !== null
        ? currentShort - movingAverage12dShort
        : null;

    const currentVs3dMaNet =
      movingAverage3dNet !== null
        ? currentNet - movingAverage3dNet
        : null;

    const currentVs6dMaNet =
      movingAverage6dNet !== null
        ? currentNet - movingAverage6dNet
        : null;

    const currentVs12dMaNet =
      movingAverage12dNet !== null
        ? currentNet - movingAverage12dNet
        : null;

    await client.query(
      `
        INSERT INTO current.sp500_ig_sentiment (
          indicator,
          series_id,

          current_long,
          current_short,
          current_net,

          previous_day_long,
          previous_day_short,
          previous_day_net,

          long_net_change,
          short_net_change,
          net_net_change,

          long_percent_change,
          short_percent_change,
          net_percent_change,

          moving_average_3d_long,
          current_vs_3d_ma_long,

          moving_average_6d_long,
          current_vs_6d_ma_long,

          moving_average_12d_long,
          current_vs_12d_ma_long,

          moving_average_3d_short,
          current_vs_3d_ma_short,

          moving_average_6d_short,
          current_vs_6d_ma_short,

          moving_average_12d_short,
          current_vs_12d_ma_short,

          moving_average_3d_net,
          current_vs_3d_ma_net,

          moving_average_6d_net,
          current_vs_6d_ma_net,

          moving_average_12d_net,
          current_vs_12d_ma_net,

          asset,
          source,
          observed_at
        )
        VALUES (
          $1, $2,

          $3, $4, $5,

          $6, $7, $8,

          $9, $10, $11,

          $12, $13, $14,

          $15, $16,

          $17, $18,

          $19, $20,

          $21, $22,

          $23, $24,

          $25, $26,

          $27, $28,

          $29, $30,

          $31, $32,

          $33, $34,

          $35
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,

          current_long = EXCLUDED.current_long,
          current_short = EXCLUDED.current_short,
          current_net = EXCLUDED.current_net,

          previous_day_long = EXCLUDED.previous_day_long,
          previous_day_short = EXCLUDED.previous_day_short,
          previous_day_net = EXCLUDED.previous_day_net,

          long_net_change = EXCLUDED.long_net_change,
          short_net_change = EXCLUDED.short_net_change,
          net_net_change = EXCLUDED.net_net_change,

          long_percent_change = EXCLUDED.long_percent_change,
          short_percent_change = EXCLUDED.short_percent_change,
          net_percent_change = EXCLUDED.net_percent_change,

          moving_average_3d_long =
            EXCLUDED.moving_average_3d_long,
          current_vs_3d_ma_long =
            EXCLUDED.current_vs_3d_ma_long,

          moving_average_6d_long =
            EXCLUDED.moving_average_6d_long,
          current_vs_6d_ma_long =
            EXCLUDED.current_vs_6d_ma_long,

          moving_average_12d_long =
            EXCLUDED.moving_average_12d_long,
          current_vs_12d_ma_long =
            EXCLUDED.current_vs_12d_ma_long,

          moving_average_3d_short =
            EXCLUDED.moving_average_3d_short,
          current_vs_3d_ma_short =
            EXCLUDED.current_vs_3d_ma_short,

          moving_average_6d_short =
            EXCLUDED.moving_average_6d_short,
          current_vs_6d_ma_short =
            EXCLUDED.current_vs_6d_ma_short,

          moving_average_12d_short =
            EXCLUDED.moving_average_12d_short,
          current_vs_12d_ma_short =
            EXCLUDED.current_vs_12d_ma_short,

          moving_average_3d_net =
            EXCLUDED.moving_average_3d_net,
          current_vs_3d_ma_net =
            EXCLUDED.current_vs_3d_ma_net,

          moving_average_6d_net =
            EXCLUDED.moving_average_6d_net,
          current_vs_6d_ma_net =
            EXCLUDED.current_vs_6d_ma_net,

          moving_average_12d_net =
            EXCLUDED.moving_average_12d_net,
          current_vs_12d_ma_net =
            EXCLUDED.current_vs_12d_ma_net,

          asset = EXCLUDED.asset,
          source = EXCLUDED.source,
          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        "sp500_ig_sentiment",
        IG_SP500_SERIES_ID,

        currentLong,
        currentShort,
        currentNet,

        previousLong,
        previousShort,
        previousNet,

        longNetChange,
        shortNetChange,
        netNetChange,

        longPercentChange,
        shortPercentChange,
        netPercentChange,

        movingAverage3dLong,
        currentVs3dMaLong,

        movingAverage6dLong,
        currentVs6dMaLong,

        movingAverage12dLong,
        currentVs12dMaLong,

        movingAverage3dShort,
        currentVs3dMaShort,

        movingAverage6dShort,
        currentVs6dMaShort,

        movingAverage12dShort,
        currentVs12dMaShort,

        movingAverage3dNet,
        currentVs3dMaNet,

        movingAverage6dNet,
        currentVs6dMaNet,

        movingAverage12dNet,
        currentVs12dMaNet,

        IG_SP500_ASSET,
        observation.source,
        observation.date,
      ],
    );

    await client.query("COMMIT");

    console.log(
      "✓ IG S&P 500 current injection complete",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};