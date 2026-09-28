import pool from "../../config/database.js";
import {
  selectLatestIgObservation,
  type IgMarketConfig,
  type IgSentimentData,
} from "./igSentiment.js";

export const injectIgCurrent = async (
  config: IgMarketConfig,
  data: IgSentimentData,
) => {
  console.log(`→ ${config.label} current injection initialized`);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const observation = selectLatestIgObservation(data, config.asset);

    if (!observation) {
      throw new Error(
        `No IG observation matched asset "${config.asset}"`,
      );
    }

    if (
      !Number.isFinite(observation.long) ||
      !Number.isFinite(observation.short) ||
      !Number.isFinite(observation.net)
    ) {
      throw new Error(`Current ${config.label} values are invalid`);
    }

    const currentLong = observation.long;
    const currentShort = observation.short;
    const currentNet = observation.net;

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
        FROM historical.${config.table}
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 1
      `,
      [observation.date],
    );

    const previousObservation = previousResult.rows[0];

    // The IG client-sentiment endpoint returns one undated snapshot per market,
    // so historical rows only accumulate one run at a time. On the first run
    // there is no previous day, and every derived column is nullable, so the
    // deltas are recorded as NULL rather than failing the whole injection.
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
      (previousLong !== null && !Number.isFinite(previousLong)) ||
      (previousShort !== null && !Number.isFinite(previousShort)) ||
      (previousNet !== null && !Number.isFinite(previousNet))
    ) {
      throw new Error(`Previous ${config.label} values are invalid`);
    }

    const longNetChange =
      previousLong === null ? null : currentLong - previousLong;

    const shortNetChange =
      previousShort === null ? null : currentShort - previousShort;

    const netNetChange =
      previousNet === null ? null : currentNet - previousNet;

    // A zero base has no defined percentage change, so record NULL rather than
    // a misleading 0%.
    const longPercentChange =
      previousLong === null || previousLong === 0
        ? null
        : (longNetChange! / previousLong) * 100;

    const shortPercentChange =
      previousShort === null || previousShort === 0
        ? null
        : (shortNetChange! / previousShort) * 100;

    const netPercentChange =
      previousNet === null || previousNet === 0
        ? null
        : (netNetChange! / previousNet) * 100;

    // IG publishes on trading days, so the moving averages run over the last N
    // prior observations rather than a calendar-day window: a 2-calendar-day
    // window spans at most 2 rows and often just 1 once weekends are excluded.
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
        FROM historical.${config.table}
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
      if (values.length < period) return null;

      const periodValues = values.slice(0, period);

      return periodValues.reduce((sum, value) => sum + value, 0) / period;
    };

    const buildMetricFigures = (current: number, series: number[]) => {
      const ma3 = calculateMovingAverage(series, 3);
      const ma6 = calculateMovingAverage(series, 6);
      const ma12 = calculateMovingAverage(series, 12);

      return {
        ma3,
        ma6,
        ma12,
        vsMa3: ma3 === null ? null : current - ma3,
        vsMa6: ma6 === null ? null : current - ma6,
        vsMa12: ma12 === null ? null : current - ma12,
      };
    };

    const longFigures = buildMetricFigures(
      currentLong,
      historicalRows.map((row) => row.long),
    );

    const shortFigures = buildMetricFigures(
      currentShort,
      historicalRows.map((row) => row.short),
    );

    const netFigures = buildMetricFigures(
      currentNet,
      historicalRows.map((row) => row.net),
    );

    await client.query(
      `
        INSERT INTO current.${config.table} (
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

          moving_average_3d_long = EXCLUDED.moving_average_3d_long,
          current_vs_3d_ma_long = EXCLUDED.current_vs_3d_ma_long,

          moving_average_6d_long = EXCLUDED.moving_average_6d_long,
          current_vs_6d_ma_long = EXCLUDED.current_vs_6d_ma_long,

          moving_average_12d_long = EXCLUDED.moving_average_12d_long,
          current_vs_12d_ma_long = EXCLUDED.current_vs_12d_ma_long,

          moving_average_3d_short = EXCLUDED.moving_average_3d_short,
          current_vs_3d_ma_short = EXCLUDED.current_vs_3d_ma_short,

          moving_average_6d_short = EXCLUDED.moving_average_6d_short,
          current_vs_6d_ma_short = EXCLUDED.current_vs_6d_ma_short,

          moving_average_12d_short = EXCLUDED.moving_average_12d_short,
          current_vs_12d_ma_short = EXCLUDED.current_vs_12d_ma_short,

          moving_average_3d_net = EXCLUDED.moving_average_3d_net,
          current_vs_3d_ma_net = EXCLUDED.current_vs_3d_ma_net,

          moving_average_6d_net = EXCLUDED.moving_average_6d_net,
          current_vs_6d_ma_net = EXCLUDED.current_vs_6d_ma_net,

          moving_average_12d_net = EXCLUDED.moving_average_12d_net,
          current_vs_12d_ma_net = EXCLUDED.current_vs_12d_ma_net,

          asset = EXCLUDED.asset,
          source = EXCLUDED.source,

          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        config.table,
        config.seriesId,

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

        longFigures.ma3,
        longFigures.vsMa3,

        longFigures.ma6,
        longFigures.vsMa6,

        longFigures.ma12,
        longFigures.vsMa12,

        shortFigures.ma3,
        shortFigures.vsMa3,

        shortFigures.ma6,
        shortFigures.vsMa6,

        shortFigures.ma12,
        shortFigures.vsMa12,

        netFigures.ma3,
        netFigures.vsMa3,

        netFigures.ma6,
        netFigures.vsMa6,

        netFigures.ma12,
        netFigures.vsMa12,

        observation.asset,
        observation.source,

        observation.date,
      ],
    );

    await client.query("COMMIT");

    console.log(`✓ ${config.label} current injection complete`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
