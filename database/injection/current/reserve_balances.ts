import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

export const injectReserveBalancesLatest = async (
  data: NormalizedIndicatorData,
) => {
  console.log("→ Reserve Balances current injection initialized");

  const currentObservation = data.observations.find(
    (observation) => observation.value !== null,
  );

  if (!currentObservation || currentObservation.value === null) {
    throw new Error("Reserve Balances latest observation is missing");
  }

  const currentValue = currentObservation.value;

  const previousObservation = data.observations.find(
    (observation) =>
      observation.date !== currentObservation.date &&
      observation.value !== null,
  );

  if (!previousObservation || previousObservation.value === null) {
    throw new Error(
      "Reserve Balances previous weekly observation is missing",
    );
  }

  const previousWeekValue = previousObservation.value;
  const netChange = currentValue - previousWeekValue;

  const client = await pool.connect();

  try {
    const historicalResult = await client.query<{
      date: string;
      value: string;
    }>(
      `
        SELECT date, value
        FROM historical.reserve_balances
        WHERE date < $1::date
        ORDER BY date DESC
        LIMIT 12
      `,
      [currentObservation.date],
    );

    const historicalValues = historicalResult.rows.map(
      (observation) => Number(observation.value),
    );

    if (historicalValues.length < 3) {
      throw new Error(
        `Not enough historical data for Reserve Balances moving averages. Found ${historicalValues.length} observations.`,
      );
    }

    const movingAverage30d =
      historicalValues
        .slice(0, 3)
        .reduce((sum, value) => sum + value, 0) / 3;

    const currentVs30dMa = currentValue - movingAverage30d;

    await client.query(
      `
        INSERT INTO current.reserve_balances (
          indicator,
          series_id,
          current_value,
          previous_week_value,
          net_change,
          moving_average_30d,
          current_vs_30d_ma,
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
          $8
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,
          current_value = EXCLUDED.current_value,
          previous_week_value = EXCLUDED.previous_week_value,
          net_change = EXCLUDED.net_change,
          moving_average_30d = EXCLUDED.moving_average_30d,
          current_vs_30d_ma = EXCLUDED.current_vs_30d_ma,
          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        data.indicator,
        data.seriesId,
        currentValue,
        previousWeekValue,
        netChange,
        movingAverage30d,
        currentVs30dMa,
        currentObservation.date,
      ],
    );

    console.log("✓ Reserve Balances current injection complete");

    return {
      indicator: data.indicator,
      seriesId: data.seriesId,
      currentValue,
      previousWeekValue,
      netChange,
      movingAverage30d,
      currentVs30dMa,
      observedAt: currentObservation.date,
    };
  } finally {
    client.release();
  }
};
