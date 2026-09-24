import pool from "../../../config/database.js";
import type { NormalizedIndicatorData } from "../../../types/fred/fred.types.js";

export const injectRealGdpGrowthLatest = async (
  data: NormalizedIndicatorData,
) => {
  console.log("→ Real GDP Growth current injection initialized");

  const currentObservation = data.observations.find(
    (observation) => observation.value !== null,
  );

  if (!currentObservation || currentObservation.value === null) {
    throw new Error("Real GDP Growth latest observation is missing");
  }

  const currentValue = currentObservation.value;

  const previousObservation = data.observations.find(
    (observation) =>
      observation.date !== currentObservation.date &&
      observation.value !== null,
  );

  if (!previousObservation || previousObservation.value === null) {
    throw new Error(
      "Real GDP Growth previous quarterly observation is missing",
    );
  }

  const previousQuarterValue = previousObservation.value;
  const netChange = currentValue - previousQuarterValue;

  const client = await pool.connect();

  try {
    const historicalResult = await client.query<{
      date: string;
      value: string;
    }>(
      `
        SELECT date, value
        FROM historical.real_gdp_growth
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
        `Not enough historical data for Real GDP Growth moving averages. Found ${historicalValues.length} observations.`,
      );
    }

    const movingAverage3q =
      historicalValues
        .slice(0, 3)
        .reduce((sum, value) => sum + value, 0) / 3;

    const movingAverage6q =
      historicalValues.length >= 6
        ? historicalValues
            .slice(0, 6)
            .reduce((sum, value) => sum + value, 0) / 6
        : null;

    const movingAverage12q =
      historicalValues.length >= 12
        ? historicalValues
            .slice(0, 12)
            .reduce((sum, value) => sum + value, 0) / 12
        : null;

    const currentVs3qMa = currentValue - movingAverage3q;

    const currentVs6qMa =
      movingAverage6q !== null
        ? currentValue - movingAverage6q
        : null;

    const currentVs12qMa =
      movingAverage12q !== null
        ? currentValue - movingAverage12q
        : null;

    await client.query(
      `
        INSERT INTO current.real_gdp_growth (
          indicator,
          series_id,
          current_value,
          previous_quarter_value,
          net_change,
          moving_average_3q,
          current_vs_3q_ma,
          moving_average_6q,
          current_vs_6q_ma,
          moving_average_12q,
          current_vs_12q_ma,
          observed_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
        )
        ON CONFLICT (indicator)
        DO UPDATE SET
          series_id = EXCLUDED.series_id,
          current_value = EXCLUDED.current_value,
          previous_quarter_value = EXCLUDED.previous_quarter_value,
          net_change = EXCLUDED.net_change,
          moving_average_3q = EXCLUDED.moving_average_3q,
          current_vs_3q_ma = EXCLUDED.current_vs_3q_ma,
          moving_average_6q = EXCLUDED.moving_average_6q,
          current_vs_6q_ma = EXCLUDED.current_vs_6q_ma,
          moving_average_12q = EXCLUDED.moving_average_12q,
          current_vs_12q_ma = EXCLUDED.current_vs_12q_ma,
          observed_at = EXCLUDED.observed_at,
          updated_at = NOW()
      `,
      [
        data.indicator,
        data.seriesId,
        currentValue,
        previousQuarterValue,
        netChange,
        movingAverage3q,
        currentVs3qMa,
        movingAverage6q,
        currentVs6qMa,
        movingAverage12q,
        currentVs12qMa,
        currentObservation.date,
      ],
    );

    console.log("✓ Real GDP Growth current injection complete");

    return {
      indicator: data.indicator,
      seriesId: data.seriesId,
      currentValue,
      previousQuarterValue,
      netChange,
      movingAverage3q,
      currentVs3qMa,
      movingAverage6q,
      currentVs6qMa,
      movingAverage12q,
      currentVs12qMa,
      observedAt: currentObservation.date,
    };
  } finally {
    client.release();
  }
};